// Anonymous shopper signals: what people search for, view, save and add to the bag. No names, phone numbers or accounts are
// recorded, only a random per-visit id. The shop owner uses the totals to stock better and to publish a "popular" list.
import { maskPersonalData } from './assistant';

export type SignalKind = 'view' | 'cart' | 'wish' | 'search' | 'ask';

export interface SignalEvent {
  k: SignalKind;
  /** Product id for view / cart / wish. */
  id?: string;
  /** Search words or a question (personal data masked, 80 characters at most). */
  q?: string;
  /** Number of results found (search / ask). */
  n?: number;
  /** For ask: 1 when the assistant could only give a plain fallback answer. */
  f?: number;
}

export const MAX_EVENTS_PER_BATCH = 40;
const KINDS: SignalKind[] = ['view', 'cart', 'wish', 'search', 'ask'];

/** Keeps only well-formed events and trims them, so nothing unexpected is stored. */
export function cleanEvents(input: unknown): SignalEvent[] {
  if (!Array.isArray(input)) return [];
  const events: SignalEvent[] = [];
  for (const raw of input.slice(0, MAX_EVENTS_PER_BATCH)) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as Record<string, unknown>;
    if (typeof event.k !== 'string' || !(KINDS as string[]).includes(event.k)) continue;
    const kind = event.k as SignalKind;
    const clean: SignalEvent = { k: kind };
    if (kind === 'view' || kind === 'cart' || kind === 'wish') {
      if (typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(event.id)) continue;
      clean.id = event.id;
    } else {
      if (typeof event.q !== 'string') continue;
      const q = maskPersonalData(event.q).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
      if (q.length < 2) continue;
      clean.q = q;
      if (typeof event.n === 'number' && Number.isFinite(event.n)) clean.n = Math.max(0, Math.min(999, Math.round(event.n)));
      if (kind === 'ask' && event.f === 1) clean.f = 1;
    }
    events.push(clean);
  }
  return events;
}

export interface SignalSession { day: string; events: SignalEvent[] }

export interface SignalSummary {
  sessions: number;
  topSearches: Array<{ q: string; count: number }>;
  noResultSearches: Array<{ q: string; count: number }>;
  unansweredQuestions: Array<{ q: string; count: number }>;
  products: Array<{ id: string; views: number; carts: number; wishes: number }>;
}

const countBy = (items: string[]) => {
  const map = new Map<string, number>();
  items.forEach(item => map.set(item, (map.get(item) || 0) + 1));
  return Array.from(map.entries()).map(([q, count]) => ({ q, count })).sort((left, right) => right.count - left.count || left.q.localeCompare(right.q));
};

export function summarize(sessions: SignalSession[], limit = 10): SignalSummary {
  const events = sessions.flatMap(session => session.events);
  const products = new Map<string, { id: string; views: number; carts: number; wishes: number }>();
  const entry = (id: string) => { const found = products.get(id) || { id, views: 0, carts: 0, wishes: 0 }; products.set(id, found); return found; };
  for (const event of events) {
    if (event.k === 'view' && event.id) entry(event.id).views += 1;
    if (event.k === 'cart' && event.id) entry(event.id).carts += 1;
    if (event.k === 'wish' && event.id) entry(event.id).wishes += 1;
  }
  const searches = events.filter(event => event.k === 'search' && event.q);
  return {
    sessions: sessions.length,
    topSearches: countBy(searches.map(event => event.q as string)).slice(0, limit),
    noResultSearches: countBy(searches.filter(event => event.n === 0).map(event => event.q as string)).slice(0, limit),
    unansweredQuestions: countBy(events.filter(event => event.k === 'ask' && (event.f === 1 || event.n === 0) && event.q).map(event => event.q as string)).slice(0, limit),
    products: Array.from(products.values()),
  };
}

/** How popular a product is: sales count most, then bag adds, saves and views. */
export function popularityScore(stats: { views: number; carts: number; wishes: number }, orders: number): number {
  return orders * 5 + stats.carts * 3 + stats.wishes * 2 + stats.views;
}

export function popularIds(summary: SignalSummary, orderCounts: Map<string, number>, isAvailable: (id: string) => boolean, limit = 8): string[] {
  const ids = new Set<string>([...summary.products.map(product => product.id), ...orderCounts.keys()]);
  const stats = new Map(summary.products.map(product => [product.id, product]));
  return Array.from(ids)
    .filter(isAvailable)
    .map(id => ({ id, score: popularityScore(stats.get(id) || { views: 0, carts: 0, wishes: 0 }, orderCounts.get(id) || 0) }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(entry => entry.id);
}

/** Products people look at a lot but rarely add to the bag: worth checking price, photos or description. */
export function viewedButNotAdded(summary: SignalSummary, minViews = 5): Array<{ id: string; views: number; carts: number }> {
  return summary.products.filter(product => product.views >= minViews && product.carts <= Math.floor(product.views / 10)).sort((left, right) => right.views - left.views).slice(0, 8);
}
