'use client';

import { createContext, useContext } from 'react';

/**
 * `null` means "no live rate reached this subtree" — deliberately NOT a
 * fallback number. A frozen default here was invisible by design: a price
 * rendered outside the provider silently converted at the build-time env
 * constant while the admin's own Paramètres screen showed the DB rate, and
 * nothing on the page hinted the two disagreed. `null` makes consumers choose
 * out loud, and every one of them chooses to show no gourde figure at all
 * rather than a wrong one.
 */
const FxRateContext = createContext<number | null>(null);

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
 * The current USD→HTG display rate, or `null` when rendered with no
 * `FxRateProvider` above it. Callers MUST handle `null` by omitting the
 * gourde figure — see the context's own comment for why there is no default.
 */
export function useFxRate(): number | null {
  return useContext(FxRateContext);
}
