import { useCallback, useEffect, useState } from 'react';

const KEY = 'mr:wishlist:v1';

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Saved items live in this browser only (no account needed). */
export function useWishlist() {
  const [ids, setIds] = useState<string[]>(() => read());

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage blocked: the list just resets next visit */ }
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setIds(current => (current.includes(id) ? current.filter(item => item !== id) : [id, ...current]));
  }, []);

  return { ids, has: (id: string) => ids.includes(id), toggle };
}
