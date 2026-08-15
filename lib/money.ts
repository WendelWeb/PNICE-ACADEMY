/**
 * Currency helpers — ONE USD→HTG rule for the whole app.
 *
 * `toHtgAt` is that rule, and it is EXACT: round to the nearest gourde, at
 * the rate the caller hands in. `lib/payments/moncash/types.ts`'s
 * `usdCentsToHtg` — the arithmetic that builds the REAL MonCash charge —
 * delegates here, so what a page advertises and what the buyer's wallet is
 * debited can no longer be two different numbers.
 *
 * WHY THIS CHANGED: this function used to round to the nearest 50 HTG. A $2
 * course therefore advertised "~250 HTG" and then charged 270 — the same
 * price, converted twice, two different ways. The "this is only an estimate"
 * signal now lives where it belongs: in the "≈"/"~" prefix that BROWSING
 * surfaces put in front of the figure (the USD price is the real price; the
 * gourde equivalent moves with the rate). The checkout page drops that
 * prefix and shows the exact debit, because at that point it is a commitment.
 *
 * The rate itself always comes from lib/fx.ts's `getFxRate()` — the
 * admin-editable `platform_settings.fx_rate_htg`. Every function here takes
 * it as a REQUIRED argument on purpose: there is no default, so a caller
 * that forgot to fetch the live rate fails to compile instead of quietly
 * printing a stale one.
 */

/**
 * LAST-RESORT fallback rate — used ONLY where there is no database to read
 * the admin-set rate from (lib/fx.ts's `getFxRate`, which falls back to this
 * when `DATABASE_URL` is absent or the settings row is missing).
 *
 * It is NOT a display source. Nothing renders a price from this constant
 * directly, and no conversion helper defaults to it: when the DB says 135
 * and this env var still says 132, the app must show 135 everywhere or
 * nothing at all — never a silent mix of the two, which is exactly the
 * incoherence this constant used to cause as a default parameter value.
 */
export const FX_FALLBACK_HTG = Number(process.env.NEXT_PUBLIC_USD_TO_HTG) || 132;

/**
 * Convert a USD amount to gourdes at an explicit rate, rounded to the nearest
 * whole gourde. Pure and sync so server and client display code share the one
 * rule. Non-finite / non-positive inputs give 0 rather than NaN.
 */
export function toHtgAt(usd: number, rateHtg: number): number {
  if (!Number.isFinite(usd) || !Number.isFinite(rateHtg) || usd <= 0 || rateHtg <= 0) return 0;
  return Math.round(usd * rateHtg);
}

/**
 * « 2 $ US » — the « US » is NOT optional (owner rule, août 2026): in Haiti
 * a bare « $ » is ambiguous — the « dollar haïtien » (5 gourdes) still
 * lives in everyday speech — so every US-dollar figure on the site names
 * its currency. ONE formatter, so it can never be half-applied.
 */
export function formatUsd(usd: number): string {
  return `${usd} $ US`;
}

/**
 * "1,40 $" — EXACT dollars from cents, always two decimals, comma as the
 * decimal separator (the convention of both site languages).
 *
 * Exists because money OWED TO A PERSON was displayed through a rounding
 * formatter: a teacher whose ledger held 140 net cents saw "Balans ou $1" —
 * their real balance silently shaved. Catalogue prices may round for
 * display; a balance, a ledger line or a withdrawal never may.
 */
export function formatUsdCentsExact(cents: number): string {
  return (
    (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $ US'
  );
}

export function formatHtg(htg: number): string {
  return `${htg.toLocaleString('fr-FR')} HTG`;
}

/** "10 665 HTG" derived from a USD amount at an explicit rate. Callers that
 *  are BROWSING (not committing) prefix it with "≈"/"~" themselves. */
export function htgLabelAt(usd: number, rateHtg: number): string {
  return formatHtg(toHtgAt(usd, rateHtg));
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
