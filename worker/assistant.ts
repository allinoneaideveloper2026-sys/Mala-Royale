// Smart search and the shopping assistant. Read-only: it can look things up and answer, it cannot place orders or change anything.
import {
  applyPriceFilter, buildMessages, cosine, deliveryFacts, fallbackAnswer, findColors, hybridRank, isAvailable, maskPersonalData,
  parsePriceFilter, routeIntent, sanitizeHistory, type AssistantContext, type PolicyChunk,
} from '../src/domain/assistant';
import { embed, getCatalog, type AiBinding, type CatalogEnv } from './catalog';
import { allow } from './limits';

export interface AssistantEnv extends CatalogEnv {
  AI: AiBinding;
  AI_CHAT_MODEL?: string;
  ASSISTANT_ENABLED?: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const chatModel = (env: AssistantEnv) => env.AI_CHAT_MODEL || '@cf/meta/llama-3.1-8b-instruct';
const clientKey = (request: Request) => request.headers.get('CF-Connecting-IP') || 'unknown';

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** POST /api/search {q}: products ranked by meaning plus words. */
export async function handleSearch(request: Request, env: AssistantEnv): Promise<Response> {
  if (env.ASSISTANT_ENABLED === 'false') return json({ ok: false, error: 'Smart search is switched off.' }, 503);
  if (!allow(`search:${clientKey(request)}`, 40, 60_000)) return json({ ok: false, error: 'Too many searches. Please wait a moment.' }, 429);
  const body = await readBody(request);
  const query = typeof body?.q === 'string' ? maskPersonalData(body.q).trim().slice(0, 120) : '';
  if (query.length < 2) return json({ ok: false, error: 'Type at least two letters.' }, 400);
  try {
    const catalog = await getCatalog(env);
    const indexes = catalog.items.map((item, index) => ({ item, index })).filter(entry => isAvailable(entry.item));
    const queryVector = catalog.vectors ? (await embed(env, [query]))?.[0] : undefined;
    const semantic = queryVector && catalog.vectors ? indexes.map(entry => cosine(queryVector, (catalog.vectors as Float32Array[])[entry.index])) : [];
    const items = indexes.map(entry => entry.item);
    const ranked = hybridRank(query, items, semantic, { limit: 16, minScore: 0.28 });
    const price = parsePriceFilter(query);
    const results = ranked.filter(entry => applyPriceFilter([entry.item], price).length === 1).map(entry => ({ id: entry.item.id, score: Math.round(entry.score * 100) / 100 }));
    return json({ ok: true, mode: queryVector ? 'smart' : 'words', results });
  } catch {
    return json({ ok: false, error: 'Search is not available right now.' }, 503);
  }
}

/** POST /api/similar {id}: products that look and read most like this one (other designs, same taste). */
export async function handleSimilar(request: Request, env: AssistantEnv): Promise<Response> {
  if (env.ASSISTANT_ENABLED === 'false') return json({ ok: false }, 503);
  if (!allow(`similar:${clientKey(request)}`, 60, 60_000)) return json({ ok: false }, 429);
  const body = await readBody(request);
  const id = typeof body?.id === 'string' ? body.id : '';
  try {
    const catalog = await getCatalog(env);
    const index = catalog.items.findIndex(item => item.id === id);
    if (index < 0 || !catalog.vectors) return json({ ok: false, error: 'No similar items yet.' }, 404);
    const base = catalog.items[index];
    const results = catalog.items
      .map((item, position) => ({ item, score: position === index ? -1 : cosine((catalog.vectors as Float32Array[])[index], (catalog.vectors as Float32Array[])[position]) }))
      .filter(entry => entry.score > 0.5 && isAvailable(entry.item) && (!base.designKey || entry.item.designKey !== base.designKey))
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .map(entry => entry.item.id);
    return json({ ok: true, ids: results });
  } catch {
    return json({ ok: false }, 503);
  }
}

/** POST /api/assistant {message, history}: a short answer built from the catalog and the shop's own pages. */
export async function handleAssistant(request: Request, env: AssistantEnv): Promise<Response> {
  if (env.ASSISTANT_ENABLED === 'false') return json({ ok: false, error: 'The assistant is switched off.' }, 503);
  const ip = clientKey(request);
  if (!allow(`chat:${ip}`, 14, 10 * 60_000) || !allow('chat:all', 600, 24 * 3_600_000)) {
    return json({ ok: false, error: 'The assistant is busy. Please try again in a few minutes, or message the shop on WhatsApp.' }, 429);
  }
  const body = await readBody(request);
  const message = typeof body?.message === 'string' ? maskPersonalData(body.message).trim().slice(0, 500) : '';
  if (message.length < 2) return json({ ok: false, error: 'Type your question.' }, 400);
  const history = sanitizeHistory(body?.history);

  try {
    const catalog = await getCatalog(env);
    const intent = routeIntent(message);
    const queryVector = (catalog.vectors || catalog.chunkVectors) ? (await embed(env, [message]))?.[0] : undefined;

    // Products: words plus meaning, within any price limit and colour mentioned.
    let products: AssistantContext['products'] = [];
    if (intent.products) {
      const indexes = catalog.items.map((item, index) => ({ item, index })).filter(entry => isAvailable(entry.item));
      const price = parsePriceFilter(message);
      const allowed = indexes.filter(entry => applyPriceFilter([entry.item], price).length === 1);
      const semantic = queryVector && catalog.vectors ? allowed.map(entry => cosine(queryVector, (catalog.vectors as Float32Array[])[entry.index])) : [];
      const colorNames = findColors(message);
      products = hybridRank(`${message} ${colorNames.join(' ')}`, allowed.map(entry => entry.item), semantic, { limit: 4, minScore: 0.3 }).map(entry => entry.item);
    }

    // Policies: the parts of About / Contact / Terms closest to the question.
    let policies: PolicyChunk[] = [];
    if (intent.policy && catalog.chunks.length > 0) {
      const scored = catalog.chunks.map((chunk, index) => ({
        chunk,
        score: queryVector && catalog.chunkVectors ? cosine(queryVector, catalog.chunkVectors[index]) : 0,
      }));
      policies = scored.sort((left, right) => right.score - left.score).slice(0, 2).map(entry => entry.chunk);
      if (!queryVector) {
        const words = message.toLowerCase().split(/\W+/).filter(word => word.length > 3);
        policies = catalog.chunks.filter(chunk => words.some(word => `${chunk.heading} ${chunk.text}`.toLowerCase().includes(word))).slice(0, 2);
      }
    }

    const context: AssistantContext = { products, policies, delivery: intent.pincode ? deliveryFacts(intent.pincode, catalog.shipping) : '' };
    let answer = '';
    let source: 'ai' | 'fallback' = 'fallback';
    try {
      const result = await env.AI.run(chatModel(env), { messages: buildMessages(message, history, context, catalog.whatsapp), max_tokens: 300, temperature: 0.3 });
      const text = typeof result.response === 'string' ? result.response.trim() : '';
      if (text) { answer = text.slice(0, 1200); source = 'ai'; }
    } catch {
      // The model could not be reached: fall back to a plain answer built from what was found.
    }
    if (!answer) answer = fallbackAnswer(context, catalog.whatsapp);
    return json({ ok: true, answer, source, products: intent.products ? products.map(item => item.id) : [] });
  } catch {
    return json({ ok: false, error: 'The assistant is not available right now. Please message the shop on WhatsApp.' }, 503);
  }
}
