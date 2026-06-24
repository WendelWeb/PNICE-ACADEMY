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

// No Kreyòl date locale in Intl → fall back to French formatting for ht.
function intlLocale(locale: 'ht' | 'fr'): string {
  return locale === 'ht' ? 'fr' : locale;
}

/** "20 juin 2026" — or "—" for null. */
export function fmtDate(iso: string | null | undefined, locale: 'ht' | 'fr' = 'fr'): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(intlLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "20 juin 2026, 14:32" — or "—" for null. */
export function fmtDateTime(iso: string | null | undefined, locale: 'ht' | 'fr' = 'fr'): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(intlLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
