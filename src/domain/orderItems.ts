// Order lines can be rejected one by one (for example a damaged piece) without cancelling the whole order.
import type { Order } from './types';

type Line = Order['items'][number];

export const isLineRejected = (line: Line): boolean => line.status === 'REJECTED';

export const activeLines = (order: Pick<Order, 'items'>): Line[] => order.items.filter(line => !isLineRejected(line));

export const lineAmount = (line: Line): number => line.price * line.quantity;

export const rejectedTotal = (order: Pick<Order, 'items'>): number => order.items.filter(isLineRejected).reduce((sum, line) => sum + lineAmount(line), 0);

/** What the customer should pay for after rejected lines are taken out. */
export const acceptedTotal = (order: Pick<Order, 'items' | 'itemTotal'>): number => Math.max(0, order.itemTotal - rejectedTotal(order));

export type RejectLineResult =
  | { ok: true; items: Line[]; rejectedTotal: number; rejectedLine: Line }
  | { ok: false; error: string };

/** Rejects one line. The last remaining line cannot be rejected this way: reject the whole order instead. */
export function rejectLine(order: Pick<Order, 'items' | 'stage'>, index: number, reason: string, note: string, by: string, nowIso: string): RejectLineResult {
  if (['SUBMITTED_FOR_DISPATCH', 'DELIVERED', 'NOT_ACCEPTED', 'CANCELLED'].includes(order.stage)) {
    return { ok: false, error: 'Items can only be rejected before the order is dispatched.' };
  }
  const line = order.items[index];
  if (!line) return { ok: false, error: 'Item not found.' };
  if (isLineRejected(line)) return { ok: false, error: 'This item is already rejected.' };
  if (activeLines(order).length <= 1) return { ok: false, error: 'This is the last item. Reject the whole order instead.' };
  const rejectedLine: Line = { ...line, status: 'REJECTED', rejectionReason: reason.slice(0, 120), ...(note ? { rejectionNote: note.slice(0, 300) } : {}), rejectedAt: nowIso, rejectedBy: by };
  const items = order.items.map((item, position) => (position === index ? rejectedLine : item));
  return { ok: true, items, rejectedTotal: rejectedTotal({ items }), rejectedLine };
}

/** Quantities per product for the lines that are still active (used when stock is reduced or returned). */
export function activeQuantityByProduct(order: Pick<Order, 'items'>): Array<[string, number]> {
  const totals = new Map<string, number>();
  activeLines(order).forEach(line => totals.set(line.productId, (totals.get(line.productId) || 0) + line.quantity));
  return Array.from(totals.entries());
}
