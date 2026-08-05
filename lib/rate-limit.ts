/**
 * lib/rate-limit.ts — shared in-memory sliding-window rate limiter (Stage 8 —
 * launch hygiene). Generalises the pure core `lib/site/contact-rate-limit.ts`
 * pioneered for the public /kontak form (Stage 4) so the same guard protects
 * every unauthenticated-reachable write surface: `/api/checkout`,
 * `/api/upload/course-asset`, and the contact form itself (which now sits on
 * top of this module — see contact-rate-limit.ts).
 *
 * HONEST LIMITATION, on purpose: this is IN-MEMORY and PER-INSTANCE. On a
 * serverless deploy every instance keeps its own window and a cold start
 * resets it — the real guarantee is "slows a casual abuser down", not "hard
 * global quota". That is the right size for launch; a real quota needs
 * shared state (a DB table / KV) this stage deliberately doesn't add.
 *
 * One shared, bounded map behind every caller — `rateLimit(bucket, ip, …)`
 * keys it by `${bucket}:${ip}` so callers never share a quota by accident.
 */

export type RateWindow = { max: number; windowMs: number };

/**
 * Pure sliding-window check-and-record: prunes hits older than `windowMs`,
 * then either records `now` and allows (true) or refuses (false) when the
 * key already has `max` live hits. Mutates `hits` — the caller owns the map.
 */
export function allowHit(
  hits: Map<string, number[]>,
  key: string,
  now: number,
  { max, windowMs }: RateWindow,
): boolean {
  const live = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (live.length >= max) {
    hits.set(key, live);
    return false;
  }
  live.push(now);
  hits.set(key, live);
  return true;
}

const sharedHits = new Map<string, number[]>();

/** Named windows for the two new API-route guards (Stage 8). */
export const RATE_LIMITS = {
  /** A signed-in checkout attempt — generous (retries, promo-code fixes). */
  checkout: { max: 20, windowMs: 5 * 60_000 } as RateWindow,
  /** A file upload — generous too (a course gallery is several files). */
  upload: { max: 30, windowMs: 5 * 60_000 } as RateWindow,
} as const;

/**
 * bucket+ip keyed sliding-window check against the one shared, bounded map.
 * Buckets never interfere with each other's quota — the key embeds both.
 */
export function rateLimit(
  bucket: string,
  ip: string,
  window: RateWindow,
  now = Date.now(),
): boolean {
  // Bound the map so a rotating-IP flood across every bucket can't grow
  // memory forever: once it gets large, drop fully-expired entries.
  if (sharedHits.size > 5000) {
    for (const [k, times] of sharedHits) {
      if (times.every((t) => now - t >= window.windowMs)) sharedHits.delete(k);
    }
  }
  return allowHit(sharedHits, `${bucket}:${ip}`, now, window);
}

/**
 * Extracts the caller's IP the same way every guarded route does: the first
 * hop of `x-forwarded-for` (what Vercel sets), `'unknown'` if absent — never
 * throws, never blocks a request whose proxy chain is unusual.
 */
export function ipFromHeaders(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
