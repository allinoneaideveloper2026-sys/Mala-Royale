import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isFresh, loadWithCache, readCache, writeCache } from '../src/domain/cache';

function installFakeStorage() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
}

describe('read cache', () => {
  beforeEach(installFakeStorage);

  it('round-trips data and reports freshness', () => {
    writeCache('k', { a: 1 });
    const entry = readCache<{ a: number }>('k');
    expect(entry?.data).toEqual({ a: 1 });
    expect(isFresh(entry, 1000)).toBe(true);
    expect(isFresh(entry, 1000, Date.now() + 5000)).toBe(false);
    expect(isFresh(null, 1000)).toBe(false);
  });

  it('does not call load while the cache is fresh (no billable reads)', async () => {
    writeCache('products', ['cached']);
    const load = vi.fn(async () => ['fresh']);
    const seen: string[][] = [];
    loadWithCache({ key: 'products', ttlMs: 60_000, load, onChange: v => seen.push(v), onError: () => undefined });
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(seen).toEqual([['cached']]);
  });

  it('shows stale data first, then refreshes and re-caches', async () => {
    writeCache('products', ['stale']);
    const load = vi.fn(async () => ['fresh']);
    const seen: string[][] = [];
    loadWithCache({ key: 'products', ttlMs: 0, load, onChange: v => seen.push(v), onError: () => undefined });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([['stale'], ['fresh']]);
    expect(readCache<string[]>('products')?.data).toEqual(['fresh']);
  });

  it('ignores late results after unsubscribe', async () => {
    const seen: string[][] = [];
    const stop = loadWithCache({ key: 'x', ttlMs: 0, load: async () => ['late'], onChange: v => seen.push(v), onError: () => undefined });
    stop();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(seen).toEqual([]);
  });
});
