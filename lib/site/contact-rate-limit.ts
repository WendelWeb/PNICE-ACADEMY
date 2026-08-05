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
 * Stage 8: the pure sliding-window core moved to lib/rate-limit.ts (the same
 * primitive now also guards /api/checkout and /api/upload/course-asset) —
 * `allowHit` is re-exported here unchanged so existing imports keep working,
 * and `allowContactSubmission` is now a thin wrapper over the shared,
 * bucket-keyed `rateLimit()` (bucket `'contact'`), so the contact form still
 * gets its own independent quota, never shared with the other two guards.
 */
import { allowHit, rateLimit, type RateWindow } from '@/lib/rate-limit';

export type { RateWindow };
export { allowHit };

/** Default: at most 3 messages per IP per 10 minutes (per instance). */
export const CONTACT_RATE: RateWindow = { max: 3, windowMs: 10 * 60_000 };

/** The /kontak action's entry point — one shared per-instance window. */
export function allowContactSubmission(key: string, now = Date.now()): boolean {
  return rateLimit('contact', key, CONTACT_RATE, now);
}
