'use client';

import { clerkEnabled } from '@/lib/clerk';
import { useDisplayCurrency } from '@/lib/useDisplayCurrency';
import { formatUsd, htgLabel } from '@/lib/money';

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
  if (!clerkEnabled)
    return <span className={className}>~{htgLabel(usd)}</span>;
  return <PriceSecondaryInner usd={usd} className={className} />;
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
