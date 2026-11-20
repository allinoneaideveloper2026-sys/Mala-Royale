// Kuchu (tassel) designs sold with sarees. Customers choose none or exactly one compatible design, and the price shown is
// the saree price plus the chosen Kuchu. Everything here is plain logic so it can be tested without the app.
import type { KuchuDesign, Product } from './types';

export const KUCHU_ID_PATTERN = /^[A-Z0-9]{2,12}$/;

export const cleanKuchuId = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

export function validateKuchuId(id: string, existing: KuchuDesign[], exceptId?: string): string {
  if (!KUCHU_ID_PATTERN.test(id)) return 'Kuchu ID must be 2 to 12 letters or digits (for example KCH03).';
  if (existing.some(item => item.id === id && item.id !== exceptId)) return 'That Kuchu ID is already used.';
  return '';
}

/** The Kuchu designs a customer may pick for this saree: tagged by the host, and not hidden. */
export function compatibleKuchu(product: Product, all: KuchuDesign[]): KuchuDesign[] {
  const ids = product.compatibleKuchuIds || [];
  return all.filter(item => item.active !== false && ids.includes(item.id));
}

/** Saree price (after any offer) plus the chosen Kuchu. */
export function lineUnitPrice(product: Product, kuchu?: KuchuDesign | null): number {
  return (product.offerPrice || product.price) + (kuchu ? kuchu.price : 0);
}

export function lineRegularPrice(product: Product, kuchu?: KuchuDesign | null): number {
  return product.price + (kuchu ? kuchu.price : 0);
}

/** SILK-ZRI-MAR-63M + KCH03 -> SILK-ZRI-MAR-KCH03-63M (the size stays last). */
export function itemCodeWithKuchu(itemCode: string | undefined, kuchuId: string): string {
  if (!itemCode) return '';
  const parts = itemCode.split('-');
  if (parts.length < 2) return `${itemCode}-${kuchuId}`;
  return [...parts.slice(0, -1), kuchuId, parts[parts.length - 1]].join('-');
}

/** The Kuchu choice is kept per design, so it stays when the customer switches colour. */
export const choiceKey = (product: { id: string; designKey?: string }): string => product.designKey || product.id;

/** Cart lines are told apart by saree, Kuchu and thread colour, so the same saree can be in the cart twice. */
export const lineKey = (line: { product: { id: string }; kuchu?: { id: string } | null; threadColor?: string }): string =>
  `${line.product.id}|${line.kuchu?.id || ''}|${line.threadColor || ''}`;

export const FINAL_SALE_HEADLINE = 'FINAL SALE: once your order is confirmed there is NO RETURN and NO REFUND.';
export const FINAL_SALE_DETAIL = 'This does not apply if we reject or cancel your order or an item; in that case you are refunded.';
