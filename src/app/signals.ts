import type { SignalEvent } from '../domain/signals';

// Anonymous visit statistics. They are sent in small batches to the shop's own server, never to a third party.
// A random id per browser tab is the only identifier; there is no account, name or phone number. Shoppers can turn it off.
const KEY = 'mr:stats:v1';

export const statsEnabled = (): boolean => {
  try { return window.localStorage.getItem(KEY) !== 'off'; } catch { return true; }
};

export function setStatsEnabled(on: boolean): void {
  try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked: nothing to remember */ }
}

let buffer: SignalEvent[] = [];
let timer: number | undefined;
let sid = '';

function sessionId(): string {
  if (sid) return sid;
  try {
    const stored = window.sessionStorage.getItem('mr:sid');
    if (stored) { sid = stored; return sid; }
  } catch { /* use a fresh id */ }
  sid = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('');
  try { window.sessionStorage.setItem('mr:sid', sid); } catch { /* ignore */ }
  return sid;
}

function flush(useBeacon = false): void {
  if (buffer.length === 0) return;
  const events = buffer.splice(0, 40);
  const body = JSON.stringify({ sid: sessionId(), events });
  try {
    if (useBeacon && navigator.sendBeacon) navigator.sendBeacon('/api/signals', new Blob([body], { type: 'application/json' }));
    else void fetch('/api/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch { /* statistics are best effort */ }
}

export function recordSignal(event: SignalEvent): void {
  if (!statsEnabled() || typeof window === 'undefined') return;
  buffer.push(event);
  if (buffer.length >= 20) { flush(); return; }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => flush(), 30000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
}
