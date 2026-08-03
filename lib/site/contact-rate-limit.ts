/**
 * lib/site/contact-rate-limit.ts — the tiny sliding-window rate limiter
 * behind the public /kontak form's server action (Stage 4).
 *
 * HONEST LIMITATION, on purpose: this is IN-MEMORY and PER-INSTANCE. On a
 * serverless deploy every instance keeps its own window and a cold start
 * resets it — so the real-world guarantee is "slows a casual spammer down",
 * not "hard global quota". That is the right size for a contact form whose
 * worst case is a few extra support tickets; anything stronger needs shared
 * state (a DB table / KV) this stage deliberately doesn't add.
 *
 * Pure core (`allowHit`) exported for unit tests; the module-level default
 * map + `allowContactSubmission` are what the action itself uses.
 */

export type RateWindow = { max: number; windowMs: number };

/** Default: at most 3 messages per IP per 10 minutes (per instance). */
export const CONTACT_RATE: RateWindow = { max: 3, windowMs: 10 * 60_000 };

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

const contactHits = new Map<string, number[]>();

/** The /kontak action's entry point — one shared per-instance window. */
export function allowContactSubmission(key: string, now = Date.now()): boolean {
  // Bound the map so a rotating-IP flood can't grow memory forever: once it
  // gets large, drop entries whose window has fully expired.
  if (contactHits.size > 1000) {
    for (const [k, times] of contactHits) {
      if (times.every((t) => now - t >= CONTACT_RATE.windowMs)) contactHits.delete(k);
    }
  }
  return allowHit(contactHits, key, now, CONTACT_RATE);
}
