import { auth, firebaseConfigured } from '../firebase';
import { classifyAmount, classifyPaymentTime, extractUtr, readPaymentTime, type AmountStatus, type TimeStatus } from '../domain/paymentProof';
import type { PaymentStatus, ProofReading, ProofVerdict } from '../domain/proofVerdict';
import { compressImage } from './imageCompress';
import { readScreenshotText } from './readScreenshot';

export interface ProofResult {
  source: 'server' | 'browser';
  utr: string;
  amountStatus: AmountStatus;
  seen: number[];
  timeStatus: TimeStatus;
  /** Payment time as printed in the screenshot, when it could be read. */
  paidAtIso: string;
  paymentStatus: PaymentStatus;
}

const toDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Could not read the screenshot.'));
  reader.readAsDataURL(file);
});

async function readOnServer(file: File, expectedAmount: number): Promise<ProofResult> {
  const user = auth?.currentUser;
  if (!firebaseConfigured || !user) throw new Error('No signed-in session.');
  const token = await user.getIdToken();
  const small = await compressImage(file, 1280, 0.8);
  const image = await toDataUrl(small);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/read-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image, expectedAmount }),
      signal: controller.signal,
    });
    const body = await response.json() as { ok: boolean; error?: string; reading?: ProofReading; verdict?: ProofVerdict };
    if (!response.ok || !body.ok || !body.reading || !body.verdict) throw new Error(body.error || 'The reader is not available.');
    return {
      source: 'server',
      utr: body.reading.utr,
      amountStatus: body.verdict.amountStatus,
      seen: body.verdict.seen,
      timeStatus: body.verdict.timeStatus,
      paidAtIso: body.verdict.paidAtIso || '',
      paymentStatus: body.reading.paymentStatus,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

async function readInBrowser(file: File, expectedAmount: number, onProgress?: (fraction: number) => void): Promise<ProofResult> {
  const text = await readScreenshotText(file, onProgress);
  const amount = classifyAmount(text, expectedAmount);
  const paid = readPaymentTime(text);
  const paymentStatus: PaymentStatus = /\b(failed|declined|unsuccessful|rejected)\b/i.test(text) ? 'failed' : /\b(pending|in progress|processing)\b/i.test(text) ? 'pending' : 'unknown';
  return {
    source: 'browser',
    utr: extractUtr(text),
    amountStatus: amount.status,
    seen: amount.seen,
    timeStatus: classifyPaymentTime(paid),
    paidAtIso: paid ? paid.date.toISOString() : '',
    paymentStatus,
  };
}

/**
 * Reads the UTR, amount, date and time from a payment screenshot. The server reader (AI model) is tried first because it
 * is far more accurate; if it is unavailable the reader inside the browser is used; if both fail the customer types the UTR.
 */
export async function readPaymentProof(file: File, expectedAmount: number, onProgress?: (fraction: number) => void): Promise<ProofResult> {
  try {
    return await readOnServer(file, expectedAmount);
  } catch {
    return readInBrowser(file, expectedAmount, onProgress);
  }
}
