// Small in-memory limits so one visitor cannot use up the free AI allowance. They reset when the Worker restarts, so they are
// a safety net, not a guarantee. The website falls back to normal search whenever a limit is hit.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [bucketKey, value] of buckets) if (value.resetAt < now) buckets.delete(bucketKey);
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
