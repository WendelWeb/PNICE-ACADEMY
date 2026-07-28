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
