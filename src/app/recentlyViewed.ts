import { useCallback, useEffect, useState } from 'react';

const KEY = 'mr:recent:v1';

const read = (): string[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
};

/** Products this shopper looked at recently. Kept in this browser only. */
export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>(() => read());
  useEffect(() => { try { window.localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* ignore */ } }, [ids]);
  const push = useCallback((id: string) => setIds(current => [id, ...current.filter(item => item !== id)].slice(0, 12)), []);
  return { ids, push };
}
