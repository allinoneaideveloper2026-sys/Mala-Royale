// Receives anonymous shopper signals from the website and stores them in Firestore (one document per batch).
// The Worker signs in anonymously (with the public web API key) so it can write; the Firestore rules limit what can be written.
import { cleanEvents } from '../src/domain/signals';
import { addDocument } from './firestoreRest';
import { allow } from './limits';

export interface SignalsEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_API_KEY?: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

let anon: { token: string; expiresAt: number } | null = null;

async function anonymousToken(env: SignalsEnv): Promise<string | null> {
  if (!env.FIREBASE_API_KEY) return null;
  if (anon && anon.expiresAt > Date.now() + 60_000) return anon.token;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!response.ok) return null;
  const body = await response.json() as { idToken?: string; expiresIn?: string };
  if (!body.idToken) return null;
  anon = { token: body.idToken, expiresAt: Date.now() + (Number(body.expiresIn) || 3600) * 1000 };
  return body.idToken;
}

const istDay = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** POST /api/signals {sid, events}. Always answers quickly; storing is best effort. */
export async function handleSignals(request: Request, env: SignalsEnv): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!allow(`signals:${ip}`, 30, 10 * 60_000)) return json({ ok: true, stored: false });
  let body: { sid?: unknown; events?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ ok: false }, 400);
  }
  const sid = typeof body.sid === 'string' && /^[a-f0-9]{8,32}$/.test(body.sid) ? body.sid : '';
  const events = cleanEvents(body.events);
  if (!sid || events.length === 0) return json({ ok: true, stored: false });
  try {
    const token = await anonymousToken(env);
    if (!token) return json({ ok: true, stored: false, reason: 'not set up' });
    await addDocument(env.FIREBASE_PROJECT_ID, 'signals', { day: istDay(), sid, at: new Date().toISOString(), events }, token);
    return json({ ok: true, stored: true });
  } catch {
    return json({ ok: true, stored: false });
  }
}
