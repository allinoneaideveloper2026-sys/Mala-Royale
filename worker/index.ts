// Cloudflare Worker: the "server side" of Mala Royale. It serves the website files and handles /api/* requests.
// Secrets and keys live in Cloudflare settings (never in the website code). See DEPLOY_CLOUDFLARE.md.
import { buildVerdict, parseModelJson, sanitizeReading } from '../src/domain/proofVerdict';
import { isNotifyEvent } from '../src/domain/notifications';
import type { Order } from '../src/domain/types';
import { createDocument, getDocument } from './firestoreRest';
import { sendNotifications, type NotifyEnv } from './notificationService';
import { handleAssistant, handleSearch, handleSimilar } from './assistant';
import { handleSignals } from './signals';
import { handleHostAssist } from './hostAssist';
import { VISION_MODEL } from './models';

interface Env extends NotifyEnv {
  AI: { run: (model: string, input: unknown) => Promise<{ response?: unknown; data?: number[][] }> };
  AI_CHAT_MODEL?: string;
  AI_EMBED_MODEL?: string;
  ASSISTANT_ENABLED?: string;
  FIREBASE_API_KEY?: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  FIREBASE_PROJECT_ID: string;
  DEVELOPER_EMAILS: string;
  OWNER_EMAILS?: string;
}

const MAX_IMAGE_CHARS = 2_500_000; // about 1.8 MB of image data

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// ---------- Firebase sign-in check (so only real visitors of the shop can use the AI) ----------
interface TokenClaims { sub: string; email?: string; token: string }
let jwksCache: { at: number; keys: Array<JsonWebKey & { kid: string }> } | null = null;

const b64urlToBytes = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
};

async function getKeys() {
  if (jwksCache && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!response.ok) throw new Error('Could not load sign-in keys.');
  const body = await response.json() as { keys: Array<JsonWebKey & { kid: string }> };
  jwksCache = { at: Date.now(), keys: body.keys };
  return body.keys;
}

async function verifyFirebaseToken(request: Request, projectId: string): Promise<TokenClaims | null> {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as { kid?: string; alg?: string };
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as Record<string, unknown>;
    if (head.alg !== 'RS256' || !head.kid) return null;
    const jwk = (await getKeys()).find(key => key.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const now = Math.floor(Date.now() / 1000);
    if (!valid || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof claims.exp !== 'number' || claims.exp < now || typeof claims.sub !== 'string' || !claims.sub) return null;
    return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email.toLowerCase() : undefined, token };
  } catch {
    return null;
  }
}

// ---------- Simple per-visitor limit so the free AI allowance cannot be used up by one person ----------
const usage = new Map<string, { count: number; resetAt: number }>();
function allowed(uid: string, limit = 12, windowMs = 3_600_000): boolean {
  const now = Date.now();
  const entry = usage.get(uid);
  if (!entry || entry.resetAt < now) {
    usage.set(uid, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

// ---------- Reading a payment screenshot ----------
const PROMPT = `You are reading a screenshot of a successful UPI payment made in an Indian payment app (PhonePe, Google Pay, Paytm, BHIM or a bank app).
Return ONLY one JSON object, with these keys and nothing else:
{"app": string|null, "status": "success"|"failed"|"pending"|"unknown", "amount": number|null, "utr": string|null, "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, "payee": string|null}
Rules:
- "amount" is the rupee amount paid, as a plain number (no symbol, no commas).
- "utr" is the 12-digit UPI reference. It can be labelled UTR, UPI Ref No, UPI transaction ID or Reference number. Do NOT use the longer "Transaction ID" that starts with letters (like T2611...). If you cannot read all 12 digits clearly, use null.
- "date" and "time" are when the payment was made, as printed. Use 24-hour time.
- Use null for anything you cannot read clearly. Never guess digits.`;

async function readProof(request: Request, env: Env, uid: string): Promise<Response> {
  if (!allowed(uid)) return json({ ok: false, error: 'Too many screenshots in the last hour. Please try again later.' }, 429);
  let body: { image?: string; expectedAmount?: number };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }
  const image = body.image || '';
  const expected = Number(body.expectedAmount);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
    return json({ ok: false, error: 'Send a JPEG, PNG or WebP screenshot under 1.8 MB.' }, 400);
  }
  if (!Number.isFinite(expected) || expected <= 0) return json({ ok: false, error: 'Missing order amount.' }, 400);

  let answer: unknown;
  try {
    const result = await env.AI.run(VISION_MODEL, {
      messages: [
        { role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: image } }] },
      ],
      max_tokens: 300,
      temperature: 0,
    });
    answer = result.response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsLicense = /agree|license/i.test(message);
    return json({ ok: false, error: needsLicense ? 'The AI model licence has not been accepted yet (developer: open /api/ai-license).' : 'The screenshot reader is busy. Please type the UTR.' }, 503);
  }

  const text = typeof answer === 'string' ? answer : JSON.stringify(answer ?? {});
  const parsed = typeof answer === 'object' && answer !== null && !Array.isArray(answer) ? answer as Record<string, unknown> : parseModelJson(text);
  const reading = sanitizeReading(parsed);
  const verdict = buildVerdict(reading, expected, Date.now());
  return json({ ok: true, reading, verdict });
}

// One-time: the Llama vision model needs its licence accepted on your Cloudflare account. Developer only.
async function acceptLicense(env: Env): Promise<Response> {
  try {
    await env.AI.run(VISION_MODEL, { prompt: 'agree' });
    return json({ ok: true, message: 'Licence accepted. You can now read screenshots.' });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

// ---------- Notifications ----------
const listOf = (value: string | undefined) => (value || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);

/** A host is a configured owner or developer, or has an active host record (read with their own token). */
async function isStaffMember(claims: TokenClaims, env: Env): Promise<boolean> {
  const email = claims.email;
  if (!email) return false;
  if (listOf(env.DEVELOPER_EMAILS).includes(email) || listOf(env.OWNER_EMAILS).includes(email)) return true;
  const record = await getDocument(env.FIREBASE_PROJECT_ID, `hostAccess/${encodeURIComponent(email)}`, claims.token);
  return Boolean(record) && record?.active !== false;
}

async function notify(request: Request, env: Env, claims: TokenClaims): Promise<Response> {
  let body: { orderId?: string; event?: string; force?: boolean };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }
  const orderId = String(body.orderId || '');
  if (!/^[A-Za-z0-9-]{4,40}$/.test(orderId) || !isNotifyEvent(body.event)) return json({ ok: false, error: 'Unknown order or event.' }, 400);
  const event = body.event;

  const staff = await isStaffMember(claims, env);
  // Customers may only trigger the confirmation for their own new order.
  if (!staff && event !== 'ORDER_PLACED') return json({ ok: false, error: 'Not allowed.' }, 403);

  const data = await getDocument(env.FIREBASE_PROJECT_ID, `orders/${orderId}`, claims.token);
  if (!data) return json({ ok: false, error: 'Order not found.' }, 404);
  const order = data as unknown as Order;
  if (!staff && order.userId !== claims.sub) return json({ ok: false, error: 'Not allowed.' }, 403);

  // The first request for an order and event reserves it; repeats are skipped (staff can force a re-send).
  const documentId = body.force && staff ? `${orderId}_${event}_${Date.now()}` : `${orderId}_${event}`;
  const reserved = await createDocument(env.FIREBASE_PROJECT_ID, 'notificationLog', documentId, { orderId, event, by: claims.email || claims.sub, at: new Date().toISOString() }, claims.token);
  if (!reserved) return json({ ok: true, duplicate: true, results: null });

  const results = await sendNotifications({ env, event, order, fetchFn: (input, init) => fetch(input, init) });
  return json({ ok: true, results });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (url.pathname === '/api/health') return json({ ok: true });

    // Public, read-only helpers for shoppers (no sign-in needed). They are rate-limited and fall back to normal search on the site.
    if (url.pathname === '/api/search' && request.method === 'POST') return handleSearch(request, env);
    if (url.pathname === '/api/assistant' && request.method === 'POST') return handleAssistant(request, env);
    if (url.pathname === '/api/similar' && request.method === 'POST') return handleSimilar(request, env);
    if (url.pathname === '/api/signals' && request.method === 'POST') return handleSignals(request, env);

    const claims = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
    if (!claims) return json({ ok: false, error: 'Please sign in again.' }, 401);

    if (url.pathname === '/api/read-proof' && request.method === 'POST') return readProof(request, env, claims.sub);
    if (url.pathname === '/api/notify' && request.method === 'POST') return notify(request, env, claims);
    if (url.pathname === '/api/host-assist' && request.method === 'POST') {
      if (!(await isStaffMember(claims, env))) return json({ ok: false, error: 'Staff only.' }, 403);
      return handleHostAssist(request, env, claims.sub);
    }

    if (url.pathname === '/api/ai-license') {
      const developers = (env.DEVELOPER_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
      if (!claims.email || !developers.includes(claims.email)) return json({ ok: false, error: 'Developer only.' }, 403);
      return acceptLicense(env);
    }

    return json({ ok: false, error: 'Not found.' }, 404);
  },
};
