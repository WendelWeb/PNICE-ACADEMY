'use client';

/**
 * Shared promo state for the checkout page (Stage: checkout honesty).
 *
 * PromoCodeField (order-summary column) validates a code and publishes the
 * applied result here; PaymentMethods (payment column) reads it to (a) send
 * the code with the /api/checkout POST — where it is RE-validated
 * server-side and actually discounts the Stripe amount — and (b) show the
 * discounted total on the pay button, so the button never promises a price
 * the server wouldn't charge.
 *
 * A plain client context wrapped around the page's server-rendered grid
 * (children pass through untouched). Both consumers are null-safe, so either
 * component still works standalone without the provider.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

export type AppliedPromo = {
  code: string;
  discountCents: number;
  netCents: number;
};

type PromoContextValue = {
  applied: AppliedPromo | null;
  setApplied: (promo: AppliedPromo | null) => void;
};

const PromoContext = createContext<PromoContextValue | null>(null);

export function CheckoutPromoProvider({ children }: { children: ReactNode }) {
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  return <PromoContext.Provider value={{ applied, setApplied }}>{children}</PromoContext.Provider>;
}

/** `null` outside a provider — consumers degrade to "no promo applied". */
export function usePromoContext(): PromoContextValue | null {
  return useContext(PromoContext);
}
