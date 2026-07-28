/**
 * Admin-editable settings helpers.
 *
 * Task fix/fx-rate-unify: the USD→HTG rate itself no longer lives here — it
 * used to be an in-memory `fxRate` variable (admin-only, reset on restart,
 * never persisted, and disconnected from both the public site's env-based
 * rate AND the unused `platform_settings.fx_rate_htg` DB column). It now
 * lives in lib/fx.ts (`getFxRate`/`setFxRate`), backed by that DB column —
 * the single source of truth read by the admin AND the public site alike.
 * This file keeps only the pure cents→HTG-at-a-given-rate helper, which has
 * no state of its own and needs no DB access.
 */

/** Convert USD cents to gourdes at the live admin rate, rounded to nearest 50. */
export function htgFromCentsAt(cents: number, rate: number): number {
  return Math.round(((cents / 100) * rate) / 50) * 50;
}
