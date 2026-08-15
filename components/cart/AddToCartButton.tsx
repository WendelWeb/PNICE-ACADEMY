'use client';

import { useTranslations } from 'next-intl';
import { IconShoppingCartPlus, IconCheck } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { useCart } from '@/components/cart/cart-context';

/**
 * « Ajoute nan panye » — the second path to buying, next to the direct
 * « Achte » CTA on a course sales page. Toggles into a link to the cart once
 * the course is in it, so the same spot always answers "what now?".
 *
 * IN THE SERVER HTML from the first paint. This used to render null until
 * hydration, which meant: no button at all on a slow phone, in data-saver
 * mode, or whenever a chunk failed — the owner looked at the page and saw
 * nothing. Pre-hydration it renders its neutral "add" state (a click before
 * React attaches simply does nothing, exactly like any not-yet-hydrated
 * button); hydration then flips it to the real in-cart state if needed.
 * Only a missing CartProvider (non-shop contexts) renders nothing.
 */
export function AddToCartButton({
  slug,
  title,
  priceUsd,
  className,
  compact = false,
}: {
  slug: string;
  title: string;
  priceUsd: number;
  className?: string;
  /** Icon-first, fixed-width variant for tight rows (the mobile buy bar). */
  compact?: boolean;
}) {
  const t = useTranslations('panye');
  const cart = useCart();
  if (!cart) return null;
  const inCart = cart.hydrated && cart.has(slug);

  if (compact) {
    return inCart ? (
      <Link
        href="/panye"
        aria-label={t('inCartGo', { count: cart.count })}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-teal/50 text-teal transition-colors hover:bg-teal/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal',
          className,
        )}
      >
        <IconCheck size={18} />
      </Link>
    ) : (
      <button
        type="button"
        aria-label={t('add')}
        onClick={() => cart.add({ slug, title, priceUsd })}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink/25 text-ink/70 transition-colors hover:border-ochre hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre',
          className,
        )}
      >
        <IconShoppingCartPlus size={18} />
      </button>
    );
  }

  if (inCart) {
    return (
      <Link href="/panye" className={cn(buttonClasses('ghost', 'lg', 'w-full'), className)}>
        <IconCheck size={16} className="text-teal" />
        {t('inCartGo', { count: cart.count })}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => cart.add({ slug, title, priceUsd })}
      className={cn(buttonClasses('ghost', 'lg', 'w-full'), className)}
    >
      <IconShoppingCartPlus size={16} />
      {t('add')}
    </button>
  );
}
