// Small localStorage cache used to keep Firestore reads (and the free-tier daily quota) low.
// Everything here is best-effort: if storage is unavailable the app simply reads from Firestore.

const PREFIX = 'mr:cache:v1:';

interface Entry<T> {
  savedAt: number;
  data: T;
}

export function readCache<T>(key: string): Entry<T> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data } satisfies Entry<T>));
  } catch {
    // Storage full or blocked: ignore, the next visit will just read from Firestore.
  }
}

export function isFresh(entry: Entry<unknown> | null, ttlMs: number, now: number = Date.now()): boolean {
  return !!entry && now - entry.savedAt >= 0 && now - entry.savedAt < ttlMs;
}

export interface CachedLoadOptions<T> {
  key: string;
  ttlMs: number;
  /** Reads fresh data from Firestore. Only called when the cache is missing or stale. */
  load: () => Promise<T>;
  onChange: (value: T) => void;
  onError: (error: Error) => void;
}

/**
 * Shows cached data immediately, and only calls `load` (billable Firestore reads) when the cache is
 * missing or older than `ttlMs`. Returns an unsubscribe function that stops late callbacks.
 */
export function loadWithCache<T>({ key, ttlMs, load, onChange, onError }: CachedLoadOptions<T>): () => void {
  let cancelled = false;
  const cached = readCache<T>(key);
  if (cached) onChange(cached.data);
  if (isFresh(cached, ttlMs)) return () => { cancelled = true; };

  load().then(value => {
    if (cancelled) return;
    writeCache(key, value);
    onChange(value);
  }).catch(error => {
    if (!cancelled) onError(error instanceof Error ? error : new Error(String(error)));
  });

  return () => { cancelled = true; };
}
