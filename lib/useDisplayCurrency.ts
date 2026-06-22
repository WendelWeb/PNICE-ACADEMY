'use client';

import { usePreferences, type Currency } from './usePreferences';
import { formatUsd, formatHtg, toHtg } from './money';

/**
 * Shared currency-display preference. Prices across the site read this instead
 * of each page redoing its own logic. Default USD (incl. signed-out visitors).
 */
export function useDisplayCurrency() {
  const { prefs } = usePreferences();
  const currency: Currency = prefs.currency ?? 'USD';

  return {
    currency,
    /** Amount in the preferred currency. */
    primary: (usd: number) =>
      currency === 'HTG' ? formatHtg(toHtg(usd)) : formatUsd(usd),
    /** The other currency, for the muted secondary line. */
    secondary: (usd: number) =>
      currency === 'HTG' ? formatUsd(usd) : `~${formatHtg(toHtg(usd))}`,
  };
}
