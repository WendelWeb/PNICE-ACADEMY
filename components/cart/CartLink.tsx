'use client';

import { useTranslations } from 'next-intl';
import { IconShoppingCart } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { useCart } from '@/components/cart/cart-context';

/**
 * The header's cart entry — icon plus a live count badge. Hidden while the
 * cart is empty: a permanent zero would just be noise, and the « Ajoute nan
 * panye » button on every course page is the discovery path.
 */
export function CartLink() {
  const t = useTranslations('panye');
  const cart = useCart();
  if (!cart || !cart.hydrated || cart.count === 0) return null;

  return (
    <Link
      href="/panye"
      aria-label={t('linkLabel', { count: cart.count })}
      className="relative flex items-center text-ink/70 transition-colors hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
    >
      <IconShoppingCart size={20} />
      <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-ochre px-1 font-mono text-[10px] font-bold leading-none text-[#1b1207]">
        {cart.count}
      </span>
    </Link>
  );
}
