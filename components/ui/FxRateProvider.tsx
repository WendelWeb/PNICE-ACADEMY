'use client';

import { createContext, useContext } from 'react';
import { USD_TO_HTG } from '@/lib/money';

const FxRateContext = createContext<number>(USD_TO_HTG);

/**
 * Wraps the public site (app/[locale]/(site)/layout.tsx — already
 * `force-dynamic`) with the live USD→HTG rate read from the DB
 * (lib/fx.ts's `getFxRate`, `platform_settings.fx_rate_htg`) — the single
 * source of truth every price-display component reads via `useFxRate()`.
 * Task fix/fx-rate-unify: this is what makes an admin's rate edit show up
 * on public course pages (the admin write revalidates these routes too —
 * see lib/admin/actions.ts's `setFxRateAction`).
 */
export function FxRateProvider({ rate, children }: { rate: number; children: React.ReactNode }) {
  return <FxRateContext.Provider value={rate}>{children}</FxRateContext.Provider>;
}

/**
 * The current USD→HTG display rate. Defaults to the env constant
 * (lib/money.ts's `USD_TO_HTG`) when rendered with no `FxRateProvider`
 * above it — e.g. the admin route group, a sibling of `(site)` that does
 * not inherit its layout.
 */
export function useFxRate(): number {
  return useContext(FxRateContext);
}
