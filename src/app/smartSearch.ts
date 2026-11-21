import { useEffect, useState } from 'react';

export interface SmartSearch {
  /** Product ids ranked by meaning plus words, best first. null while waiting or when smart search is unavailable. */
  ids: string[] | null;
  mode: 'smart' | 'words' | null;
}

/**
 * Asks the server for meaning-based results for what the shopper typed (after a short pause). If the server is off, busy or
 * unreachable, it returns nothing and the page keeps using its normal word search, so search never breaks.
 */
export function useSmartSearch(query: string, enabled: boolean): SmartSearch {
  const [state, setState] = useState<SmartSearch & { forQuery: string }>({ ids: null, mode: null, forQuery: '' });
  const trimmed = query.trim();

  useEffect(() => {
    if (!enabled || trimmed.length < 3) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const controller = new AbortController();
        const abort = window.setTimeout(() => controller.abort(), 6000);
        const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: trimmed }), signal: controller.signal });
        window.clearTimeout(abort);
        const body = await response.json() as { ok: boolean; mode?: 'smart' | 'words'; results?: Array<{ id: string }> };
        if (cancelled) return;
        if (response.ok && body.ok && Array.isArray(body.results)) setState({ ids: body.results.map(result => result.id), mode: body.mode || 'words', forQuery: trimmed });
        else setState({ ids: null, mode: null, forQuery: trimmed });
      } catch {
        if (!cancelled) setState({ ids: null, mode: null, forQuery: trimmed });
      }
    }, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [trimmed, enabled]);

  return trimmed.length >= 3 && state.forQuery === trimmed ? { ids: state.ids, mode: state.mode } : { ids: null, mode: null };
}
