/** Best-effort in-memory limiter. On serverless each instance has its own memory, so this slows
 *  brute force but is not a global guarantee; use a shared store (Upstash/Supabase) for a hard limit. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function isBlocked(key: string, max = 8, now = Date.now()): boolean {
  const e = attempts.get(key);
  if (!e) return false;
  if (e.resetAt <= now) { attempts.delete(key); return false; }
  return e.count >= max;
}
export function recordFailure(key: string, windowMs = 15 * 60 * 1000, now = Date.now()) {
  const e = attempts.get(key);
  if (!e || e.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + windowMs });
  else e.count += 1;
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
}
export function clearFailures(key: string) { attempts.delete(key); }
export function resetAllForTests() { attempts.clear(); }
