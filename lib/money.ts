/**
 * Currency helpers. A single rate constant drives every gourdes amount shown
 * on the site — update USD_TO_HTG (placeholder) with the live rate before launch.
 */
// Configurable via env (set NEXT_PUBLIC_USD_TO_HTG and update manually for the
// MVP). Falls back to a placeholder. Leaves the door open for a live FX API
// later without touching call sites.
export const USD_TO_HTG = Number(process.env.NEXT_PUBLIC_USD_TO_HTG) || 132;

/**
 * Convert a USD amount to gourdes at an explicit rate, rounded to the
 * nearest 50 HTG. The rate normally comes from lib/fx.ts's `getFxRate()`
 * (the DB-backed admin-editable rate) — this stays a pure, sync helper so
 * both server and client display code can share the same rounding rule.
 */
export function toHtgAt(usd: number, rateHtg: number): number {
  return Math.round((usd * rateHtg) / 50) * 50;
}

/** Convert a USD amount to gourdes at the env-default rate, rounded to the
 *  nearest 50 HTG. Kept for backward-compat and as the fallback path when
 *  no live rate is available (see lib/fx.ts) — prefer `toHtgAt` wherever a
 *  live rate is in hand. */
export function toHtg(usd: number): number {
  return toHtgAt(usd, USD_TO_HTG);
}

export function formatUsd(usd: number): string {
  return `${usd}$`;
}

export function formatHtg(htg: number): string {
  return `${htg.toLocaleString('fr-FR')} HTG`;
}

/** "≈ 10 450 HTG" style label derived from a USD amount, at an explicit rate. */
export function htgLabelAt(usd: number, rateHtg: number): string {
  return formatHtg(toHtgAt(usd, rateHtg));
}

/** "≈ 10 450 HTG" style label derived from a USD amount, at the env-default
 *  rate. Kept for backward-compat / the fallback path — prefer `htgLabelAt`
 *  wherever a live rate is in hand. */
export function htgLabel(usd: number): string {
  return htgLabelAt(usd, USD_TO_HTG);
}

/**
 * The gourdes figure to print on a RECEIPT (Stage 2 money-exactness pass).
 *
 * A real MonCash charge must show what MonCash actually took
 * (`payments.amount_htg`, frozen at sale time — db/migrations/0019), not a
 * number re-derived from today's FX rate: the two can legitimately disagree
 * the moment an admin edits the rate, and re-deriving would make a buyer's
 * own receipt drift after the fact. `storedHtg` therefore ALWAYS wins when
 * it is a real positive figure, and `liveRateHtg` is never consulted in that
 * case — passing a different, "changed since the sale" rate must not change
 * the output. Only a payment with no stored figure (a Stripe sale, where no
 * gourdes ever changed hands, or a MonCash row that predates this column)
 * falls back to the live-rate ESTIMATE.
 */
export function receiptHtgText(storedHtg: number | null | undefined, usdCents: number, liveRateHtg: number): string {
  return typeof storedHtg === 'number' && Number.isFinite(storedHtg) && storedHtg > 0
    ? formatHtg(Math.round(storedHtg))
    : htgLabelAt(usdCents / 100, liveRateHtg);
}
