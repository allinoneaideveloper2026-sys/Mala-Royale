import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order } from '../domain/types';
import { orderUpdateKey } from './orderMessages';

const STORAGE_KEY = 'mr:seen-orders:v1:';

function readSeen(userKey: string): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY + userKey);
    return raw ? JSON.parse(raw) as Record<string, string> : null;
  } catch {
    return null;
  }
}

function writeSeen(userKey: string, seen: Record<string, string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY + userKey, JSON.stringify(seen));
  } catch {
    // Storage blocked: the banner will simply show again next time.
  }
}

/**
 * Tells a customer which of their orders changed since they last looked (status, a host message, a hold, a cancellation).
 * The first time on a device nothing is reported, so a new visitor is not shown old changes as alerts.
 */
export function useOrderUpdates(orders: Order[], userKey: string) {
  const [seen, setSeen] = useState<Record<string, string> | null>(() => readSeen(userKey));

  useEffect(() => { setSeen(readSeen(userKey)); }, [userKey]);

  useEffect(() => {
    if (orders.length === 0 || seen !== null) return;
    const initial: Record<string, string> = {};
    orders.forEach(order => { initial[order.orderId] = orderUpdateKey(order); });
    writeSeen(userKey, initial);
    setSeen(initial);
  }, [orders, seen, userKey]);

  const changed = useMemo(() => (
    seen === null ? [] : orders.filter(order => (seen[order.orderId] ?? '') !== orderUpdateKey(order))
  ), [orders, seen]);

  const markSeen = useCallback((orderId?: string) => {
    const next = { ...(readSeen(userKey) || {}) };
    orders.forEach(order => {
      if (!orderId || order.orderId === orderId) next[order.orderId] = orderUpdateKey(order);
    });
    writeSeen(userKey, next);
    setSeen(next);
  }, [orders, userKey]);

  return { changed, markSeen };
}
