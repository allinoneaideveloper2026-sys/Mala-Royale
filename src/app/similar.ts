import { useEffect, useState } from 'react';

const cache = new Map<string, string[] | null>();

/** Product ids that look and read most like this one (from the server's meaning search). null while loading or unavailable. */
export function useSimilar(productId: string | null): string[] | null {
  const [ids, setIds] = useState<string[] | null>(productId && cache.has(productId) ? cache.get(productId) ?? null : null);
  useEffect(() => {
    if (!productId) { setIds(null); return undefined; }
    if (cache.has(productId)) { setIds(cache.get(productId) ?? null); return undefined; }
    let cancelled = false;
    setIds(null);
    fetch('/api/similar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: productId }) })
      .then(response => response.json() as Promise<{ ok: boolean; ids?: string[] }>)
      .then(body => { const result = body.ok && Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : null; cache.set(productId, result); if (!cancelled) setIds(result); })
      .catch(() => { cache.set(productId, null); });
    return () => { cancelled = true; };
  }, [productId]);
  return ids;
}
