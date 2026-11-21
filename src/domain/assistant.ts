// Logic for smart search and the shopping assistant. Pure functions, shared by the Worker and the tests.
import { PALETTE } from './itemCode';
import { evaluateCourierRules, type ShippingConfig } from './shipping';

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  offerPrice?: number;
  color?: string;
  size?: string;
  itemCode?: string;
  quantity?: number;
  status?: string;
  image?: string;
  designKey?: string;
  kuchuNames: string[];
}

export const unitPriceOf = (item: CatalogItem) => item.offerPrice || item.price;

export const isAvailable = (item: CatalogItem): boolean =>
  item.status !== 'COMING_SOON' && item.status !== 'OUT_OF_STOCK' && !(typeof item.quantity === 'number' && item.quantity <= 0);

/** The text that is turned into a meaning-vector for each product. */
export function productText(item: CatalogItem): string {
  return [
    item.name,
    item.category,
    item.color ? `Colour: ${item.color}` : '',
    item.size ? `Size: ${item.size}` : '',
    item.description,
    item.itemCode ? `Item ${item.itemCode}` : '',
    item.kuchuNames.length > 0 ? `Kuchu work options: ${item.kuchuNames.join(', ')}` : '',
  ].filter(Boolean).join('. ');
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    na += a[index] * a[index];
    nb += b[index] * b[index];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const tokenize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(token => token.length >= 2);

/** Share of the query words found in the product text (name and colour count double). */
export function lexicalScore(query: string, item: CatalogItem): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  const strong = `${item.name} ${item.color || ''} ${item.itemCode || ''}`.toLowerCase();
  const weak = `${item.category} ${item.description} ${item.size || ''} ${item.kuchuNames.join(' ')}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (strong.includes(token)) score += 1;
    else if (weak.includes(token)) score += 0.6;
  }
  return Math.min(1, score / tokens.length);
}

export interface Ranked {
  item: CatalogItem;
  score: number;
}

/** Mixes meaning-similarity with word matching. `semantic` holds one cosine value per item (or is empty if AI is unavailable). */
export function hybridRank(query: string, items: CatalogItem[], semantic: number[], options: { limit?: number; minScore?: number } = {}): Ranked[] {
  const limit = options.limit ?? 12;
  const minScore = options.minScore ?? 0.25;
  const ranked = items.map((item, index) => {
    const lexical = lexicalScore(query, item);
    const sem = semantic.length > index ? Math.max(0, Math.min(1, (semantic[index] - 0.3) / 0.5)) : lexical;
    return { item, score: semantic.length > 0 ? 0.65 * sem + 0.35 * lexical : lexical };
  });
  return ranked.filter(entry => entry.score >= minScore).sort((left, right) => right.score - left.score).slice(0, limit);
}

export interface PriceFilter { min?: number; max?: number }

/** "under 5000", "below ₹4k", "above 3,000", "between 3000 and 6000". */
export function parsePriceFilter(message: string): PriceFilter {
  const text = message.toLowerCase().replace(/,/g, '');
  const amount = (value: string, suffix?: string) => Math.round(Number(value) * (suffix === 'k' ? 1000 : 1));
  const between = /between\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(k)?\s*(?:and|to|-)\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(k)?/.exec(text);
  if (between) return { min: amount(between[1], between[2]), max: amount(between[3], between[4]) };
  const max = /(?:under|below|less than|upto|up to|within|max(?:imum)?)\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(k)?/.exec(text);
  const min = /(?:above|over|more than|minimum|min)\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(k)?/.exec(text);
  return { ...(max ? { max: amount(max[1], max[2]) } : {}), ...(min ? { min: amount(min[1], min[2]) } : {}) };
}

export const applyPriceFilter = (items: CatalogItem[], filter: PriceFilter): CatalogItem[] =>
  items.filter(item => (filter.max === undefined || unitPriceOf(item) <= filter.max) && (filter.min === undefined || unitPriceOf(item) >= filter.min));

export function findColors(message: string): string[] {
  const text = message.toLowerCase();
  return PALETTE.filter(color => text.includes(color.name.toLowerCase())).map(color => color.name);
}

export type Intent = { policy: boolean; products: boolean; pincode: string | null };

const POLICY_WORDS = /\b(return|refund|exchange|cancel|cancellation|terms|policy|policies|shipping|courier|delivery|deliver|payment|pay|upi|contact|whatsapp|about|final sale|warranty|damaged|track|tracking)\b/i;
const PRODUCT_WORDS = /\b(saree|sari|silk|cotton|colou?r|kuchu|tassel|design|border|zari|under|below|above|maroon|navy|gold|red|blue|green|pink|black|white|show|find|suggest|recommend|new|offer|price|cheap|budget)\b|₹/i;

/** Decides what the question needs. A 6-digit number is treated as a pincode. */
export function routeIntent(message: string): Intent {
  const pin = /(?<!\d)(\d{6})(?!\d)/.exec(message);
  const policy = POLICY_WORDS.test(message) || Boolean(pin);
  const products = PRODUCT_WORDS.test(message) || findColors(message).length > 0 || !policy;
  return { policy, products, pincode: pin ? pin[1] : null };
}

export interface PolicyChunk {
  id: string;
  page: string;
  heading: string;
  text: string;
}

/** Splits a page into chunks at its "## " headings so the right part can be found for a question. */
export function chunkPages(pages: Record<string, { title: string; body: string }>): PolicyChunk[] {
  const chunks: PolicyChunk[] = [];
  for (const [key, page] of Object.entries(pages)) {
    let heading = page.title;
    let lines: string[] = [];
    const flush = () => {
      const text = lines.join('\n').trim();
      if (text) chunks.push({ id: `${key}:${chunks.length}`, page: page.title, heading, text });
      lines = [];
    };
    for (const line of page.body.replace(/\r/g, '').split('\n')) {
      if (line.startsWith('## ')) { flush(); heading = line.slice(3).trim(); } else lines.push(line);
    }
    flush();
  }
  return chunks;
}

export const policyChunkText = (chunk: PolicyChunk) => `${chunk.page} - ${chunk.heading}: ${chunk.text.replace(/\*\*/g, '').replace(/^- /gm, '')}`.slice(0, 900);

/** Hides phone numbers and email addresses before a message is sent to the AI. Pincodes (6 digits) are kept. */
export function maskPersonalData(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/(?<!\d)\+?\d(?:[\s-]?\d){9,}(?!\d)/g, '[number]');
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export function sanitizeHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn): turn is ChatTurn => Boolean(turn) && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .slice(-6)
    .map(turn => ({ role: turn.role, content: maskPersonalData(turn.content).slice(0, 500) }));
}

export function deliveryFacts(pincode: string, config: ShippingConfig): string {
  const one = evaluateCourierRules({ items: [{ quantity: 1 }], pincode, userId: 'guest', recentOrders: [], config, now: Date.now() });
  const many = evaluateCourierRules({ items: [{ quantity: 1 }, { quantity: 1 }], pincode, userId: 'guest', recentOrders: [], config, now: Date.now() });
  return `Pincode ${pincode}: one saree: ${one.reason} Two or more items: ${many.reason}`;
}

export interface AssistantContext {
  products: CatalogItem[];
  policies: PolicyChunk[];
  delivery: string;
}

export function buildMessages(userMessage: string, history: ChatTurn[], context: AssistantContext, whatsapp: string): Array<{ role: string; content: string }> {
  const productLines = context.products.map(item => `- ${item.name} | id ${item.id} | ₹${unitPriceOf(item)}${item.offerPrice ? ` (was ₹${item.price})` : ''} | ${item.color || 'colour n/a'} | ${item.category}${item.kuchuNames.length ? ` | Kuchu: ${item.kuchuNames.join(', ')}` : ''}`).join('\n');
  const system = [
    'You are the shopping assistant of Mala Royale, an Indian saree boutique that sells sarees with optional custom Kuchu (tassel) work.',
    'Use ONLY the facts in CONTEXT. If the answer is not there, say you are not sure and suggest messaging the shop on WhatsApp. Never invent prices, stock, offers, colours or policies.',
    'Keep the answer short (under 90 words), warm and clear. Reply in the same language the customer wrote in.',
    'Never ask for phone numbers, addresses or payment details. Do not promise delivery dates. All sales are final once an order is confirmed; do not offer returns.',
    'When you recommend products, use their names exactly as in CONTEXT.',
    '',
    'CONTEXT',
    context.products.length ? `PRODUCTS (in stock):\n${productLines}` : 'PRODUCTS: none matched.',
    context.delivery ? `DELIVERY: ${context.delivery}` : '',
    context.policies.length ? `SHOP POLICIES:\n${context.policies.map(policyChunkText).join('\n')}` : '',
    whatsapp ? `SHOP WHATSAPP: ${whatsapp}` : '',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: system }, ...history, { role: 'user', content: maskPersonalData(userMessage).slice(0, 500) }];
}

/** A plain answer built from what was found, used when the AI model cannot be reached. */
export function fallbackAnswer(context: AssistantContext, whatsapp: string): string {
  const parts: string[] = [];
  if (context.delivery) parts.push(context.delivery);
  if (context.policies.length > 0) parts.push(policyChunkText(context.policies[0]).slice(0, 380));
  if (context.products.length > 0) parts.push(`Here are some options: ${context.products.slice(0, 4).map(item => `${item.name} (₹${unitPriceOf(item)})`).join(', ')}.`);
  if (parts.length === 0) parts.push(`I could not find that. ${whatsapp ? `Please message us on WhatsApp ${whatsapp}.` : 'Please message the shop.'}`);
  return parts.join(' ');
}
