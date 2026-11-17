// Payment screenshots (PhonePe, GPay, Paytm, bank apps) are uploaded to Cloudinary and the link is kept on the order.
// Only Cloudinary links are accepted, so a customer cannot make the host open some other website.
// This pattern is mirrored in firestore.rules; change both together.
const PROOF_URL_PATTERN = /^https:\/\/res\.cloudinary\.com\/.+/;

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export function isProofUrl(url: string | undefined | null): url is string {
  return typeof url === 'string' && PROOF_URL_PATTERN.test(url);
}

export function validateProofFile(file: File | null | undefined): string {
  if (!file) return 'Attach the screenshot of your payment (PhonePe, GPay, Paytm or your bank app).';
  if (!file.type.startsWith('image/')) return 'The payment proof must be an image (a screenshot).';
  if (file.size > MAX_PROOF_BYTES) return 'The screenshot is too large. Please choose one under 10 MB.';
  return '';
}

/**
 * A fingerprint of the exact screenshot file. It replaces the typed UTR as the "already used" check:
 * the same screenshot file cannot be submitted for two different payments.
 */
export async function fingerprintFile(file: Pick<File, 'arrayBuffer'>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------------------------
// Reading the screenshot text (done in the customer's browser by an OCR step, see readScreenshot.ts)
// ---------------------------------------------------------------------------------------------

export const UTR_PATTERN = /^\d{12}$/;
export const isValidUtr = (value: string): boolean => UTR_PATTERN.test(value.trim());

const UTR_LABEL = /(utr|upi\s*(?:transaction|trans\.?|txn|ref(?:erence)?)\s*(?:id|no\.?|number)?|ref(?:erence)?\s*(?:id|no\.?|number)|transaction\s*id|txn\s*id)/i;

/**
 * Finds the 12-digit UTR in text read from a payment screenshot.
 * A 12-digit number that sits next to a label such as "UTR" or "UPI Ref No" wins. Otherwise a single
 * stand-alone 12-digit number is used. If there are several unlabeled ones, nothing is returned,
 * so the customer types it instead of the app guessing.
 */
export function extractUtr(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const standalone = /(?<!\d)(\d{12})(?!\d)/g;
  const labelled: string[] = [];
  const all: string[] = [];
  lines.forEach((line, index) => {
    const found = Array.from(line.matchAll(standalone), match => match[1]);
    found.forEach(value => { if (!all.includes(value)) all.push(value); });
    if (found.length > 0 && UTR_LABEL.test(line)) labelled.push(...found);
    else if (found.length === 0 && UTR_LABEL.test(line)) {
      // The number may be on the next line, under its label.
      const next = Array.from((lines[index + 1] || '').matchAll(standalone), match => match[1]);
      labelled.push(...next);
    }
  });
  const uniqueLabelled = Array.from(new Set(labelled));
  if (uniqueLabelled.length >= 1) return uniqueLabelled[0];
  return all.length === 1 ? all[0] : '';
}

/** True when the expected rupee amount shows up as a stand-alone number in the screenshot text. */
export function amountAppears(text: string, expected: number): boolean {
  if (!Number.isFinite(expected) || expected <= 0) return false;
  // OCR often misreads the rupee sign, so look at every number instead of only "₹" ones.
  const numbers = Array.from(text.matchAll(/(?<![\d.])(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?(?![\d])/g), match => (
    Number(`${match[1].replace(/,/g, '')}${match[2] ? `.${match[2]}` : ''}`)
  ));
  return numbers.some(value => Math.abs(value - expected) < 0.005);
}

export type UtrSource = 'auto' | 'edited' | 'manual';

export function classifyUtrSource(read: string, finalValue: string): UtrSource {
  if (!read) return 'manual';
  return read === finalValue.trim() ? 'auto' : 'edited';
}

// ---------------------------------------------------------------------------------------------
// Amount and time checks. The screenshot must show the exact amount of THIS order (after offers
// and discounts) and a payment time close to "now".
// ---------------------------------------------------------------------------------------------

export type AmountStatus = 'match' | 'mismatch' | 'notfound';

const toNumber = (digits: string, decimals?: string) => Number(`${digits.replace(/,/g, '')}${decimals ? `.${decimals}` : ''}`);

/** Amounts written next to a rupee sign or "Rs" / "INR" in the screenshot text. */
export function readPaidAmounts(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?/gi)) {
    found.push(toNumber(match[1], match[2]));
  }
  return found;
}

export function classifyAmount(text: string, expected: number): { status: AmountStatus; seen: number[] } {
  const seen = readPaidAmounts(text);
  if (seen.some(value => Math.abs(value - expected) < 0.005)) return { status: 'match', seen };
  // The rupee sign is often misread by OCR, so fall back to any stand-alone number in the text.
  if (amountAppears(text, expected)) return { status: 'match', seen };
  return { status: seen.length > 0 ? 'mismatch' : 'notfound', seen };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TIME = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i;

function toDate(day: number, month: number, year: number, timeText: RegExpMatchArray | null): { date: Date; hasTime: boolean } | null {
  if (month < 0 || month > 11 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  let hours = 0;
  let minutes = 0;
  if (timeText) {
    hours = Number(timeText[1]);
    minutes = Number(timeText[2]);
    const meridiem = (timeText[3] || '').toLowerCase().replace(/\./g, '');
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
  }
  return { date: new Date(year, month, day, hours, minutes, 0, 0), hasTime: Boolean(timeText) };
}

/**
 * Finds the payment date and time printed in a screenshot (PhonePe, GPay, Paytm, bank apps), in local time.
 * Returns null when no date can be read.
 */
export function readPaymentTime(text: string): { date: Date; hasTime: boolean } | null {
  const monthNames = MONTHS.join('|');
  const patterns: Array<{ re: RegExp; read: (m: RegExpMatchArray) => [number, number, number] }> = [
    { re: new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})[a-z]*\\.?,?\\s+(\\d{4})`, 'i'), read: m => [Number(m[1]), MONTHS.indexOf(m[2].toLowerCase()), Number(m[3])] },
    { re: new RegExp(`(${monthNames})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i'), read: m => [Number(m[2]), MONTHS.indexOf(m[1].toLowerCase()), Number(m[3])] },
    { re: /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/, read: m => [Number(m[1]), Number(m[2]) - 1, Number(m[3])] },
  ];
  for (const { re, read } of patterns) {
    const match = re.exec(text);
    if (!match || match.index === undefined) continue;
    const [day, month, year] = read(match);
    // The time is usually right after the date, or just before it ("10:42 AM, 17 Nov 2026").
    const after = TIME.exec(text.slice(match.index + match[0].length, match.index + match[0].length + 30));
    const before = TIME.exec(text.slice(Math.max(0, match.index - 30), match.index));
    const parsed = toDate(day, month, year, after || before);
    if (parsed) return parsed;
  }
  return null;
}

export type TimeStatus = 'fresh' | 'stale' | 'future' | 'unknown';

export const PAYMENT_FRESH_MINUTES = 30;
const FUTURE_TOLERANCE_MINUTES = 5;

/** Is the payment time in the screenshot close to now? Without a clock time, the same calendar day counts as fresh. */
export function classifyPaymentTime(paid: { date: Date; hasTime: boolean } | null, now: Date = new Date()): TimeStatus {
  if (!paid) return 'unknown';
  const diffMinutes = (now.getTime() - paid.date.getTime()) / 60000;
  if (!paid.hasTime) {
    return paid.date.toDateString() === now.toDateString() ? 'fresh' : (paid.date.getTime() > now.getTime() ? 'future' : 'stale');
  }
  if (diffMinutes < -FUTURE_TOLERANCE_MINUTES) return 'future';
  if (diffMinutes > PAYMENT_FRESH_MINUTES) return 'stale';
  return 'fresh';
}
