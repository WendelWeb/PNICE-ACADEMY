/**
 * Display formatters for the admin dashboard. Money is stored in USD cents;
 * the gourdes equivalent is derived at the configured rate (lib/money.ts), the
 * same way the public site shows HTG everywhere a USD amount appears.
 */
import { toHtgAt } from '@/lib/money';

/** "$12,480" — whole-dollar, thousands-separated. */
export function fmtUsdCents(cents: number): string {
  // « US » explicit + French thousands (spaces) — same owner rule as
  // lib/money.ts's formatUsd: a bare $ is ambiguous in Haiti.
  return Math.round(cents / 100).toLocaleString('fr-FR') + ' $ US';
}

/**
 * "≈ 1 647 360 HTG" — gourdes equivalent of a USD-cents amount.
 *
 * `rate` is REQUIRED and comes from lib/fx.ts's `getFxRate()` (the live
 * admin-set `platform_settings.fx_rate_htg`). It used to default to the env
 * constant, which meant any admin page that forgot to fetch the rate quietly
 * printed gourdes at a DIFFERENT rate from the page next to it — the exact
 * "the rate in Paramètres says 135 but this screen says 132" incoherence.
 * With no default, forgetting is a compile error instead of a wrong number.
 *
 * The "≈" is honest: the USD cents are the accounting truth, and this is a
 * conversion at today's rate — unlike a real MonCash charge, which is shown
 * exactly from `payments.amount_htg` (lib/money.ts's `receiptHtgText`).
 */
export function fmtHtgFromCents(cents: number, rate: number): string {
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
