/**
 * Display formatters for the admin dashboard. Money is stored in USD cents;
 * the gourdes equivalent is derived at the configured rate (lib/money.ts), the
 * same way the public site shows HTG everywhere a USD amount appears.
 */
import { toHtgAt, USD_TO_HTG } from '@/lib/money';

/** "$12,480" — whole-dollar, thousands-separated. */
export function fmtUsdCents(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/** "≈ 1 647 360 HTG" — gourdes equivalent of a USD-cents amount, at an
 *  explicit rate when the caller has one in hand (e.g. lib/fx.ts's live DB
 *  rate); defaults to the env constant otherwise (Task fix/fx-rate-unify —
 *  same fallback lib/fx.ts's `getFxRate` itself uses with no live DB). */
export function fmtHtgFromCents(cents: number, rate: number = USD_TO_HTG): string {
  return '≈ ' + toHtgAt(cents / 100, rate).toLocaleString('fr-FR') + ' HTG';
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

/**
 * "juillet 2026" from a `'YYYY-MM'` period string (Task: pro-rata split of
 * PNICE all-access revenue — the "Pass PNICE" ledger label and the
 * /admin/repartition page's period headings). Same ht→fr Intl fallback as
 * `fmtDate` (no Kreyòl month locale exists) — `timeZone: 'UTC'` pins the
 * month regardless of the reader's local offset, since the period itself is
 * a UTC calendar month (lib/teacher/platform-pass-split.ts). Returns the raw
 * string unchanged if it isn't a valid `'YYYY-MM'`.
 */
export function fmtPeriodLabel(period: string | null | undefined, locale: 'ht' | 'fr' = 'fr'): string {
  if (!period) return '—';
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return date.toLocaleDateString(intlLocale(locale), { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
