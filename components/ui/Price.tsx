'use client';

import { clerkEnabled } from '@/lib/clerk';
import { useDisplayCurrency } from '@/lib/useDisplayCurrency';
import { useFxRate } from '@/components/ui/FxRateProvider';
import { formatUsd, htgLabelAt } from '@/lib/money';

/**
 * Primary price in the user's preferred display currency (USD by default).
 * Env-gated: with Clerk off (no keys) it renders USD statically so public pages
 * keep working without a ClerkProvider.
 */
export function Price({ usd, className }: { usd: number; className?: string }) {
  if (!clerkEnabled) return <span className={className}>{formatUsd(usd)}</span>;
  return <PricePrimary usd={usd} className={className} />;
}

function PricePrimary({ usd, className }: { usd: number; className?: string }) {
  const { primary } = useDisplayCurrency();
  return <span className={className}>{primary(usd)}</span>;
}

/** The muted secondary amount (the other currency), incl. its own "~" prefix. */
export function PriceSecondary({
  usd,
  className,
}: {
  usd: number;
  className?: string;
}) {
  if (!clerkEnabled) return <PriceSecondaryStatic usd={usd} className={className} />;
  return <PriceSecondaryInner usd={usd} className={className} />;
}

/** Clerk-off path: still reads the live DB rate via `FxRateProvider`
 *  (Task fix/fx-rate-unify) so an admin's rate edit shows up even with no
 *  ClerkProvider mounted. No live rate ⇒ nothing, rather than a gourde
 *  figure converted at a stale constant. */
function PriceSecondaryStatic({ usd, className }: { usd: number; className?: string }) {
  const rate = useFxRate();
  if (rate === null) return null;
  return <span className={className}>~{htgLabelAt(usd, rate)}</span>;
}

function PriceSecondaryInner({
  usd,
  className,
}: {
  usd: number;
  className?: string;
}) {
  const { secondary } = useDisplayCurrency();
  return <span className={className}>{secondary(usd)}</span>;
}
