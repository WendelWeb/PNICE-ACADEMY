/**
 * Display formatters for the admin dashboard. Money is stored in USD cents;
 * the gourdes equivalent is derived at the configured rate (lib/money.ts), the
 * same way the public site shows HTG everywhere a USD amount appears.
 */
import { toHtg } from '@/lib/money';

/** "$12,480" — whole-dollar, thousands-separated. */
export function fmtUsdCents(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/** "≈ 1 647 360 HTG" — gourdes equivalent of a USD-cents amount. */
export function fmtHtgFromCents(cents: number): string {
  return '≈ ' + toHtg(cents / 100).toLocaleString('fr-FR') + ' HTG';
}

/** Plain integer with thin-space grouping ("1 264"). */
export function fmtInt(n: number): string {
  return n.toLocaleString('fr-FR');
}

/** One-decimal percentage ("42,3 %"). */
export function fmtPct(n: number): string {
  return n.toFixed(1).replace('.', ',') + ' %';
}
