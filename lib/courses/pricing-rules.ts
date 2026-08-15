/**
 * lib/courses/pricing-rules.ts — the ONE definition of a legal course price
 * (owner, août 2026 : « rends impossible de mettre un cours à 0 $ — option
 * pour mettre gratuit seulement »).
 *
 * The rule: a course is either FREE — priceCents EXACTLY 0, chosen through
 * an explicit « Gratis » toggle in the studio, never by leaving a field
 * empty — or PAID at $1 minimum. The trap this kills: a teacher tabs past
 * the price field, the form's `Number('') || 0` turns it into 0, and a
 * course they meant to sell ships as a giveaway. Now 1–99 cents and any
 * junk value are refused server-side; 0 survives only as a deliberate act.
 *
 * Pure module (no DB, no framework): imported by the write path (server),
 * both studio forms (client) and the tests.
 */

/** $1 — below this a price is a mistake, not a strategy. */
export const MIN_COURSE_PRICE_CENTS = 100;

/** $2,000 — above this a "price" is a typo (fat-fingered cents, pasted total). */
export const MAX_COURSE_PRICE_CENTS = 200_000;

export type CoursePriceCheck =
  | { ok: true; free: boolean }
  | { ok: false; message: 'invalid_price' | 'price_too_low' };

export function validateCoursePriceCents(cents: unknown): CoursePriceCheck {
  if (
    typeof cents !== 'number' ||
    !Number.isFinite(cents) ||
    !Number.isInteger(cents) ||
    cents < 0 ||
    cents > MAX_COURSE_PRICE_CENTS
  ) {
    return { ok: false, message: 'invalid_price' };
  }
  if (cents === 0) return { ok: true, free: true };
  // Only the honest-mistake band gets the "too low" message that points the
  // teacher at the Gratis toggle — garbage above gets a plain refusal.
  if (cents < MIN_COURSE_PRICE_CENTS) return { ok: false, message: 'price_too_low' };
  return { ok: true, free: false };
}

/** Public-surface helper: is this catalogue price the free tier? */
export function isFreeCourse(priceUsd: number): boolean {
  return priceUsd === 0;
}
