// Pure helpers for reading a payment screenshot with an AI model (used by the Worker and by the tests).
// The model returns loose text; this turns it into a checked reading and compares it with the order.
import type { AmountStatus, TimeStatus } from './paymentProof';

export type PaymentStatus = 'success' | 'failed' | 'pending' | 'unknown';

export interface ProofReading {
  utr: string;
  amount: number | null;
  date: string | null; // YYYY-MM-DD as printed in the screenshot (India time)
  time: string | null; // HH:MM, 24 hour
  paymentStatus: PaymentStatus;
}

/** Takes the first JSON object found in the model's answer. */
export function parseModelJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const toAmount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parsed = Number(cleaned);
    return cleaned && Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function sanitizeReading(raw: Record<string, unknown> | null): ProofReading {
  if (!raw) return { utr: '', amount: null, date: null, time: null, paymentStatus: 'unknown' };
  const utrDigits = String(raw.utr ?? '').replace(/\D/g, '');
  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.trim()) ? raw.date.trim() : null;
  const time = typeof raw.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(raw.time.trim()) ? raw.time.trim() : null;
  const status = String(raw.status ?? '').toLowerCase();
  const paymentStatus: PaymentStatus = /succe|complet|paid|done/.test(status) ? 'success'
    : /fail|declin|reject|unsucc/.test(status) ? 'failed'
      : /pend|process|progress/.test(status) ? 'pending' : 'unknown';
  return { utr: utrDigits.length === 12 ? utrDigits : '', amount: toAmount(raw.amount), date, time, paymentStatus };
}

export interface ProofVerdict {
  amountStatus: AmountStatus;
  seen: number[];
  timeStatus: TimeStatus;
  paidAtIso: string | null;
}

export const FRESH_MINUTES = 30;
const FUTURE_TOLERANCE_MINUTES = 5;
const IST_OFFSET_MINUTES = 330;

/** Compares a reading with the order: exact amount, and a payment time close to now (screenshot times are India time). */
export function buildVerdict(reading: ProofReading, expectedAmount: number, nowMs: number): ProofVerdict {
  const amountStatus: AmountStatus = reading.amount === null ? 'notfound' : Math.abs(reading.amount - expectedAmount) < 0.005 ? 'match' : 'mismatch';
  const seen = reading.amount === null ? [] : [reading.amount];

  if (!reading.date) return { amountStatus, seen, timeStatus: 'unknown', paidAtIso: null };
  const [year, month, day] = reading.date.split('-').map(Number);
  let timeStatus: TimeStatus;
  let paidMs: number;
  if (reading.time) {
    const [hours, minutes] = reading.time.split(':').map(Number);
    paidMs = Date.UTC(year, month - 1, day, hours, minutes) - IST_OFFSET_MINUTES * 60000;
    const diff = (nowMs - paidMs) / 60000;
    timeStatus = diff < -FUTURE_TOLERANCE_MINUTES ? 'future' : diff > FRESH_MINUTES ? 'stale' : 'fresh';
  } else {
    paidMs = Date.UTC(year, month - 1, day, 12, 0) - IST_OFFSET_MINUTES * 60000;
    const istToday = new Date(nowMs + IST_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
    timeStatus = reading.date === istToday ? 'fresh' : reading.date > istToday ? 'future' : 'stale';
  }
  return { amountStatus, seen, timeStatus, paidAtIso: new Date(paidMs).toISOString() };
}
