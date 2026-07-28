'use client';

import { usePreferences, type Currency } from './usePreferences';
import { useFxRate } from '@/components/ui/FxRateProvider';
import { formatUsd, formatHtg, toHtgAt } from './money';

/**
 * Shared currency-display preference. Prices across the site read this instead
 * of each page redoing its own logic. Default USD (incl. signed-out visitors).
 *
 * The HTG amount is derived at the live rate from `useFxRate()` (the DB-backed
 * `platform_settings.fx_rate_htg`, provided by `FxRateProvider` in the public
 * site layout) — so both the currency-preference toggle AND an admin's FX
 * rate edit are reflected here (Task fix/fx-rate-unify).
 */
export function useDisplayCurrency() {
  const { prefs } = usePreferences();
  const currency: Currency = prefs.currency ?? 'USD';
  const rate = useFxRate();

  return {
    currency,
    /** Amount in the preferred currency. */
    primary: (usd: number) =>
      currency === 'HTG' ? formatHtg(toHtgAt(usd, rate)) : formatUsd(usd),
    /** The other currency, for the muted secondary line. */
    secondary: (usd: number) =>
      currency === 'HTG' ? formatUsd(usd) : `~${formatHtg(toHtgAt(usd, rate))}`,
  };
}
