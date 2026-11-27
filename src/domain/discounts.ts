// Offers set by the host: "spend at least ₹5,000 and get 5% off", or a flat amount off. The best live offer that fits the bag
// is applied (offers do not stack). The bag total is worked out AFTER each product's own offer price.

export interface DiscountRule {
  id: string;
  /** Short name shown to customers, for example "Festive 5%". */
  name: string;
  type: 'PERCENT' | 'FLAT';
  /** Percent (1 to 90) or rupees. */
  value: number;
  /** The bag must be at least this much (after product offers). */
  minSpend: number;
  /** For percent offers: the most a customer can save. Leave empty for no cap. */
  maxDiscount?: number;
  /** The host's on/off switch. */
  active: boolean;
  /** Optional dates (YYYY-MM-DD, India time) between which the offer runs. */
  startsOn?: string;
  endsOn?: string;
}

export interface AppliedDiscount {
  ruleId: string;
  name: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  /** Rupees taken off, a whole number. */
  amount: number;
}

const IST_MINUTES = 330;
const istDay = (now: number) => new Date(now + IST_MINUTES * 60000).toISOString().slice(0, 10);

/** On, and inside its dates. */
export function ruleIsLive(rule: DiscountRule, now: number): boolean {
  if (!rule.active) return false;
  const today = istDay(now);
  if (rule.startsOn && today < rule.startsOn) return false;
  if (rule.endsOn && today > rule.endsOn) return false;
  return true;
}

/** Rupees off for this bag, rounded down to a whole rupee so the shop never gives more than promised. */
export function discountFor(rule: DiscountRule, subtotal: number): number {
  if (subtotal < rule.minSpend || subtotal <= 0) return 0;
  let amount = rule.type === 'PERCENT' ? Math.floor((subtotal * rule.value) / 100) : Math.floor(rule.value);
  if (rule.type === 'PERCENT' && rule.maxDiscount && rule.maxDiscount > 0) amount = Math.min(amount, Math.floor(rule.maxDiscount));
  return Math.max(0, Math.min(amount, Math.floor(subtotal) - 1));
}

/** The live offer that saves the customer the most. */
export function bestDiscount(subtotal: number, rules: DiscountRule[], now: number): AppliedDiscount | null {
  let best: AppliedDiscount | null = null;
  for (const rule of rules) {
    if (!ruleIsLive(rule, now)) continue;
    const amount = discountFor(rule, subtotal);
    if (amount > 0 && (!best || amount > best.amount)) best = { ruleId: rule.id, name: rule.name, type: rule.type, value: rule.value, amount };
  }
  return best;
}

/** The next offer the customer could reach by adding to the bag, and how much more they need to spend. */
export function nextOffer(subtotal: number, rules: DiscountRule[], now: number): { rule: DiscountRule; shortBy: number } | null {
  const candidates = rules
    .filter(rule => ruleIsLive(rule, now) && rule.minSpend > subtotal && discountFor(rule, rule.minSpend) > 0)
    .sort((left, right) => left.minSpend - right.minSpend);
  return candidates.length > 0 ? { rule: candidates[0], shortBy: Math.ceil(candidates[0].minSpend - subtotal) } : null;
}

const inr = (value: number) => `₹${value.toLocaleString('en-IN')}`;

export function benefitText(rule: DiscountRule): string {
  return rule.type === 'PERCENT'
    ? `${rule.value}% off${rule.maxDiscount ? ` (up to ${inr(rule.maxDiscount)})` : ''}`
    : `${inr(rule.value)} off`;
}

/** The line shown in the offers banner. */
export function offerHeadline(rule: DiscountRule): string {
  const benefit = benefitText(rule);
  return rule.minSpend > 0 ? `Spend ${inr(rule.minSpend)} or more and get ${benefit}` : `Get ${benefit} on your order`;
}

export function offerEnds(rule: DiscountRule): string {
  if (!rule.endsOn) return '';
  const [year, month, day] = rule.endsOn.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function validateRule(rule: DiscountRule): string {
  if (!rule.name.trim() || rule.name.trim().length > 40) return 'Give the offer a short name (up to 40 characters).';
  if (!Number.isFinite(rule.value) || rule.value <= 0) return 'Enter how much the offer gives.';
  if (rule.type === 'PERCENT' && rule.value > 90) return 'A percentage offer can be at most 90%.';
  if (!Number.isFinite(rule.minSpend) || rule.minSpend < 0) return 'Enter the minimum spend (0 for none).';
  if (rule.type === 'FLAT' && rule.minSpend > 0 && rule.value >= rule.minSpend) return 'A flat offer must be smaller than the minimum spend.';
  if (rule.maxDiscount !== undefined && (!Number.isFinite(rule.maxDiscount) || rule.maxDiscount <= 0)) return 'The maximum saving must be more than zero (or left empty).';
  if (rule.startsOn && rule.endsOn && rule.endsOn < rule.startsOn) return 'The end date is before the start date.';
  return '';
}

export function parseRules(raw: unknown): DiscountRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: DiscountRule[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const data = item as Record<string, unknown>;
    const rule: DiscountRule = {
      id: typeof data.id === 'string' && data.id ? data.id.slice(0, 30) : `r${rules.length + 1}`,
      name: typeof data.name === 'string' ? data.name.slice(0, 40) : '',
      type: data.type === 'FLAT' ? 'FLAT' : 'PERCENT',
      value: typeof data.value === 'number' ? data.value : 0,
      minSpend: typeof data.minSpend === 'number' ? data.minSpend : 0,
      active: data.active === true,
      ...(typeof data.maxDiscount === 'number' && data.maxDiscount > 0 ? { maxDiscount: data.maxDiscount } : {}),
      ...(typeof data.startsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.startsOn) ? { startsOn: data.startsOn } : {}),
      ...(typeof data.endsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.endsOn) ? { endsOn: data.endsOn } : {}),
    };
    if (!validateRule(rule)) rules.push(rule);
  }
  return rules;
}
