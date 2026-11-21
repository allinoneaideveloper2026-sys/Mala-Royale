// The shop's public catalog, policies and courier rules, kept in memory for a few minutes so the assistant and search
// do not read Firestore on every question. Embeddings (meaning-vectors) are made with Workers AI and kept alongside.
import { chunkPages, type CatalogItem, type PolicyChunk, productText } from '../src/domain/assistant';
import { mergePages } from '../src/domain/sitePages';
import { DEFAULT_SHIPPING, type ShippingConfig } from '../src/domain/shipping';
import { getPublicDocument, listPublicDocuments } from './firestoreRest';

export interface AiBinding { run: (model: string, input: unknown) => Promise<{ response?: unknown; data?: number[][] }> }

export interface CatalogEnv {
  AI: AiBinding;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_API_KEY?: string;
  AI_EMBED_MODEL?: string;
}

export interface Catalog {
  at: number;
  items: CatalogItem[];
  vectors: Float32Array[] | null;
  chunks: PolicyChunk[];
  chunkVectors: Float32Array[] | null;
  shipping: ShippingConfig;
  whatsapp: string;
}

const TTL_MS = 10 * 60 * 1000;
let cache: Catalog | null = null;
let building: Promise<Catalog> | null = null;

export const embedModel = (env: { AI_EMBED_MODEL?: string }) => env.AI_EMBED_MODEL || '@cf/baai/bge-base-en-v1.5';

/** Turns texts into meaning-vectors. Returns null if the AI cannot be reached, and the caller falls back to word matching. */
export async function embed(env: CatalogEnv, texts: string[]): Promise<Float32Array[] | null> {
  if (texts.length === 0) return [];
  try {
    const vectors: Float32Array[] = [];
    for (let start = 0; start < texts.length; start += 50) {
      const result = await env.AI.run(embedModel(env), { text: texts.slice(start, start + 50) });
      if (!result.data || result.data.length !== Math.min(50, texts.length - start)) return null;
      result.data.forEach(row => vectors.push(Float32Array.from(row)));
    }
    return vectors;
  } catch {
    return null;
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

async function build(env: CatalogEnv): Promise<Catalog> {
  const project = env.FIREBASE_PROJECT_ID;
  const key = env.FIREBASE_API_KEY;
  const [productDocs, kuchuDocs, pagesDoc, shippingDoc, contactDoc] = await Promise.all([
    listPublicDocuments(project, 'products', key),
    listPublicDocuments(project, 'kuchu', key).catch(() => []),
    getPublicDocument(project, 'settings/pages', key).catch(() => null),
    getPublicDocument(project, 'settings/shipping', key).catch(() => null),
    getPublicDocument(project, 'settings/contact', key).catch(() => null),
  ]);

  const kuchuName = new Map(kuchuDocs.filter(doc => doc.data.active !== false).map(doc => [doc.id, str(doc.data.name)]));
  const items: CatalogItem[] = productDocs.map(doc => {
    const data = doc.data;
    const ids = Array.isArray(data.compatibleKuchuIds) ? data.compatibleKuchuIds.filter((id): id is string => typeof id === 'string') : [];
    return {
      id: doc.id,
      name: str(data.name),
      category: str(data.category),
      description: str(data.description),
      price: num(data.price) ?? 0,
      offerPrice: num(data.offerPrice),
      color: str(data.color) || undefined,
      size: str(data.size) || undefined,
      itemCode: str(data.itemCode) || undefined,
      quantity: num(data.quantity),
      status: str(data.status) || undefined,
      image: str(data.image) || undefined,
      designKey: str(data.designKey) || undefined,
      kuchuNames: ids.map(id => kuchuName.get(id)).filter((name): name is string => Boolean(name)),
    };
  }).filter(item => item.name && item.price > 0);

  const pages = mergePages(pagesDoc as Parameters<typeof mergePages>[0]);
  const chunks = chunkPages(pages);
  const shipping: ShippingConfig = {
    ruleAEnabled: shippingDoc ? shippingDoc.ruleAEnabled !== false : DEFAULT_SHIPPING.ruleAEnabled,
    ruleBEnabled: shippingDoc ? shippingDoc.ruleBEnabled !== false : DEFAULT_SHIPPING.ruleBEnabled,
    bangalorePrefixes: shippingDoc && Array.isArray(shippingDoc.bangalorePrefixes) ? shippingDoc.bangalorePrefixes.filter((prefix): prefix is string => typeof prefix === 'string') : DEFAULT_SHIPPING.bangalorePrefixes,
  };

  const [vectors, chunkVectors] = await Promise.all([
    embed(env, items.map(productText)),
    embed(env, chunks.map(chunk => `${chunk.page} - ${chunk.heading}. ${chunk.text}`.slice(0, 1500))),
  ]);
  return { at: Date.now(), items, vectors, chunks, chunkVectors, shipping, whatsapp: str(contactDoc?.whatsappNumber) };
}

export async function getCatalog(env: CatalogEnv): Promise<Catalog> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  if (!building) {
    building = build(env).then(catalog => { cache = catalog; return catalog; }).finally(() => { building = null; });
  }
  try {
    return await building;
  } catch (error) {
    if (cache) return cache; // keep serving the last good copy
    throw error;
  }
}
