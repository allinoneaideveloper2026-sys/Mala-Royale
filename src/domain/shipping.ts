// Courier charge rules, set by the host.
//   Rule B: no courier charge for deliveries inside Bangalore (pincodes starting with the configured prefixes, 560 by default).
//   Rule A: no courier charge when the order is a single saree (quantity 1), unless the same customer already placed an
//           active order to the same pincode in the last 24 hours.
//   Rule C: otherwise the host quotes the courier charge, the customer pays it, and the host verifies it.
// Rule B is checked first, so an order inside Bangalore is free whatever Rule A says.
import type { Order } from './types';

export interface ShippingConfig {
  ruleAEnabled: boolean;
  ruleBEnabled: boolean;
  bangalorePrefixes: string[];
}

export const DEFAULT_SHIPPING: ShippingConfig = { ruleAEnabled: true, ruleBEnabled: true, bangalorePrefixes: ['560'] };

export type CourierRule = 'A' | 'B' | 'C';

export interface CourierDecision {
  rule: CourierRule;
  waived: boolean;
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_STAGES = ['NOT_ACCEPTED', 'CANCELLED'];

/** Keeps only the digits and returns a 6-digit pincode, or '' if it is not one. */
export function normalizePincode(value: string | undefined | null): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 6 ? digits : '';
}

export function parsePrefixes(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,;]+/).map(part => part.replace(/\D/g, '')).filter(part => part.length >= 2 && part.length <= 6)));
}

export function evaluateCourierRules({
  items,
  pincode,
  userId,
  recentOrders,
  config,
  now,
}: {
  items: Array<{ quantity: number }>;
  pincode: string;
  userId: string;
  recentOrders: Order[];
  config: ShippingConfig;
  now: number;
}): CourierDecision {
  const pin = normalizePincode(pincode);
  if (!pin) return { rule: 'C', waived: false, reason: 'Enter your 6-digit pincode to see the courier charge.' };

  if (config.ruleBEnabled && config.bangalorePrefixes.some(prefix => pin.startsWith(prefix))) {
    return { rule: 'B', waived: true, reason: 'Delivery within Bangalore: no courier charge.' };
  }

  const singleSaree = items.length === 1 && items[0].quantity === 1;
  if (config.ruleAEnabled && singleSaree) {
    const duplicate = recentOrders.some(order => (
      order.userId === userId
      && !INACTIVE_STAGES.includes(order.stage)
      && normalizePincode(order.address?.pincode) === pin
      && Date.parse(order.createdAt) >= now - DAY_MS
    ));
    if (!duplicate) return { rule: 'A', waived: true, reason: 'Single saree: no courier charge.' };
    return { rule: 'C', waived: false, reason: 'You already ordered to this pincode in the last 24 hours, so the standard courier charge applies.' };
  }

  return { rule: 'C', waived: false, reason: 'The host will quote the courier charge after you place the order.' };
}
