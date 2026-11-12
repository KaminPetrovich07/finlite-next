// Brute-force protection. Per account: 5 wrong passwords → locked for 15 min
// (stored in the database, so it holds across server instances). Per IP: a
// best-effort in-memory window that slows down scripted guessing.
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;

const hits = new Map<string, number[]>();

/** true if this key made more than `max` attempts in the last `windowMs`. */
export function tooMany(key: string, max = 20, windowMs = 10 * 60 * 1000, now = Date.now()): boolean {
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > max;
}
