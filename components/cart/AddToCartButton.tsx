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
 * Renders nothing outside the CartProvider or before hydration — a wrong
 * flash of state on a MONEY button is worse than a late one.
 */
export function AddToCartButton({
  slug,
  title,
  priceUsd,
  className,
}: {
  slug: string;
  title: string;
  priceUsd: number;
  className?: string;
}) {
  const t = useTranslations('panye');
  const cart = useCart();
  if (!cart || !cart.hydrated) return null;

  if (cart.has(slug)) {
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
