import { auth, firebaseConfigured } from '../firebase';
import type { NotifyEvent } from '../domain/notifications';

export interface NotifyOutcome {
  ok: boolean;
  duplicate?: boolean;
  results?: { email: string; whatsapp: string; push: string } | null;
  error?: string;
}

/**
 * Asks the server to tell the customer about this order event (email / WhatsApp, only where they agreed and the shop
 * has switched the channel on). It never throws and never blocks the shop's work: a failure just returns null.
 */
export async function notifyOrder(orderId: string, event: NotifyEvent, options: { force?: boolean } = {}): Promise<NotifyOutcome | null> {
  try {
    const user = auth?.currentUser;
    if (!firebaseConfigured || !user) return null;
    const token = await user.getIdToken();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, event, force: Boolean(options.force) }),
        signal: controller.signal,
      });
      return await response.json() as NotifyOutcome;
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** A short line for the host after an action, or '' when nothing was sent and nothing went wrong. */
export function describeNotify(outcome: NotifyOutcome | null): string {
  if (!outcome || !outcome.results) return '';
  const { email, whatsapp } = outcome.results;
  const sent = [email === 'sent' ? 'email' : '', whatsapp === 'sent' ? 'WhatsApp' : ''].filter(Boolean);
  const failed = [email.startsWith('failed') ? `email (${email.slice(8, 80)})` : '', whatsapp.startsWith('failed') ? `WhatsApp (${whatsapp.slice(8, 80)})` : ''].filter(Boolean);
  if (failed.length > 0) return `Customer could not be notified by ${failed.join(' and ')}.`;
  if (sent.length > 0) return `Customer notified by ${sent.join(' and ')}.`;
  return '';
}
