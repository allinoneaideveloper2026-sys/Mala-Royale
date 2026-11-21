// Drafting help for the shop's staff: a product description from a photo, and a polite reply to a customer message.
// Everything it writes is a DRAFT that the host reads, edits and sends themselves.
import { findColors, maskPersonalData } from '../src/domain/assistant';
import { parseModelJson } from '../src/domain/proofVerdict';
import type { AiBinding } from './catalog';
import { allow } from './limits';
import { VISION_MODEL } from './models';

export interface HostAssistEnv {
  AI: AiBinding;
  AI_CHAT_MODEL?: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const chatModel = (env: HostAssistEnv) => env.AI_CHAT_MODEL || '@cf/meta/llama-3.1-8b-instruct';
const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

const DESCRIBE_PROMPT = `You write product descriptions for Mala Royale, a premium Indian saree boutique.
Write 2 or 3 elegant sentences (at most 60 words) about this saree. Describe only what is visible or given: the weave or sheen, border and pallu, colours, and a fitting occasion.
Do not mention price, offers, delivery or returns. Do not invent fabric names unless one is given.
Return ONLY one JSON object: {"description": string, "tags": [up to 6 short lowercase words], "colors": [colour names you can see]}.`;

const REPLY_SYSTEM = `You help the owner of Mala Royale, an Indian saree boutique, reply to a customer on WhatsApp.
Write a warm, short reply (at most 70 words) in the customer's language. Be specific to their message.
Shop rules: all sales are final once an order is confirmed (no return, no refund), except that we refund the amount paid when WE reject or cancel an order or an item. A payment problem is checked by asking for the payment screenshot and UTR. Never promise a refund, a date or a discount. If unsure, say we will check and come back.
Return only the reply text.`;

function fallbackDescription(hints: Record<string, string>): string {
  const parts = [hints.color ? `${hints.color} ` : '', hints.category || 'saree'].join('').trim();
  return `A graceful ${parts.toLowerCase()}${hints.name ? `, ${hints.name}` : ''}, chosen for its rich colour and elegant drape. A lovely choice for festive and family occasions.`;
}

async function describe(request: Record<string, unknown>, env: HostAssistEnv): Promise<Response> {
  const hintsRaw = (request.hints && typeof request.hints === 'object' ? request.hints : {}) as Record<string, unknown>;
  const hints = { name: clip(hintsRaw.name, 80), category: clip(hintsRaw.category, 40), color: clip(hintsRaw.color, 30), size: clip(hintsRaw.size, 20) };
  const image = typeof request.image === 'string' ? request.image : '';
  const hintText = Object.entries(hints).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join('; ');
  const hasImage = /^data:image\/(jpeg|png|webp);base64,/.test(image) && image.length <= 2_500_000;

  let text = '';
  try {
    if (hasImage) {
      const result = await env.AI.run(VISION_MODEL, { messages: [{ role: 'user', content: [{ type: 'text', text: `${DESCRIBE_PROMPT}\nGiven details: ${hintText || 'none'}` }, { type: 'image_url', image_url: { url: image } }] }], max_tokens: 350, temperature: 0.4 });
      text = typeof result.response === 'string' ? result.response : '';
    } else {
      const result = await env.AI.run(chatModel(env), { messages: [{ role: 'system', content: DESCRIBE_PROMPT }, { role: 'user', content: `Given details: ${hintText || 'a saree'}` }], max_tokens: 300, temperature: 0.4 });
      text = typeof result.response === 'string' ? result.response : '';
    }
  } catch {
    text = '';
  }
  const parsed = parseModelJson(text);
  const description = clip(parsed?.description, 420);
  const tags = Array.isArray(parsed?.tags) ? (parsed?.tags as unknown[]).map(tag => clip(tag, 20).toLowerCase()).filter(Boolean).slice(0, 6) : [];
  const colors = findColors(Array.isArray(parsed?.colors) ? (parsed?.colors as unknown[]).join(' ') : '').slice(0, 4);
  if (!description) return json({ ok: true, source: 'fallback', description: fallbackDescription(hints), tags: [], colors: [] });
  return json({ ok: true, source: 'ai', description, tags, colors });
}

async function reply(request: Record<string, unknown>, env: HostAssistEnv): Promise<Response> {
  const message = maskPersonalData(clip(request.message, 600));
  if (message.length < 2) return json({ ok: false, error: 'There is no message to reply to.' }, 400);
  const context = [clip(request.kind, 30) === 'PAYMENT_ISSUE' ? 'This is a payment problem report.' : '', clip(request.issueType, 80) ? `Problem type: ${clip(request.issueType, 80)}.` : '', clip(request.status, 60) ? `Order status: ${clip(request.status, 60)}.` : '', clip(request.orderId, 40) ? `Order: ${clip(request.orderId, 40)}.` : ''].filter(Boolean).join(' ');
  try {
    const result = await env.AI.run(chatModel(env), { messages: [{ role: 'system', content: REPLY_SYSTEM }, { role: 'user', content: `${context}\nCustomer message: ${message}` }], max_tokens: 220, temperature: 0.4 });
    const text = typeof result.response === 'string' ? result.response.trim().slice(0, 700) : '';
    if (text) return json({ ok: true, source: 'ai', reply: text });
  } catch {
    // fall through to the plain draft
  }
  return json({ ok: true, source: 'fallback', reply: 'Hello! Thank you for your message. We are checking this and will get back to you shortly. If it is about a payment, please share the payment screenshot and UTR so we can check it quickly.' });
}

/** POST /api/host-assist {task: 'describe' | 'reply', ...}. The caller has already been checked as staff. */
export async function handleHostAssist(request: Request, env: HostAssistEnv, staffId: string): Promise<Response> {
  if (!allow(`host:${staffId}`, 60, 3_600_000)) return json({ ok: false, error: 'Too many requests this hour.' }, 429);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }
  if (body.task === 'describe') return describe(body, env);
  if (body.task === 'reply') return reply(body, env);
  return json({ ok: false, error: 'Unknown task.' }, 400);
}
