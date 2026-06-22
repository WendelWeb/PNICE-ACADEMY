/**
 * Currency helpers. A single rate constant drives every gourdes amount shown
 * on the site — update USD_TO_HTG (placeholder) with the live rate before launch.
 */
// Configurable via env (set NEXT_PUBLIC_USD_TO_HTG and update manually for the
// MVP). Falls back to a placeholder. Leaves the door open for a live FX API
// later without touching call sites.
export const USD_TO_HTG = Number(process.env.NEXT_PUBLIC_USD_TO_HTG) || 132;

/** Convert a USD amount to gourdes, rounded to the nearest 50 HTG. */
export function toHtg(usd: number): number {
  return Math.round((usd * USD_TO_HTG) / 50) * 50;
}

export function formatUsd(usd: number): string {
  return `${usd}$`;
}

export function formatHtg(htg: number): string {
  return `${htg.toLocaleString('fr-FR')} HTG`;
}

/** "≈ 10 450 HTG" style label derived from a USD amount. */
export function htgLabel(usd: number): string {
  return formatHtg(toHtg(usd));
}
