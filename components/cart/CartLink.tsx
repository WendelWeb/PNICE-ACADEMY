'use client';

import { useTranslations } from 'next-intl';
import { IconShoppingCart } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { useCart } from '@/components/cart/cart-context';

/**
 * The header's cart entry — ALWAYS visible, badge only when it holds
 * something.
 *
 * It used to hide while empty, which read as "this shop has no cart at all"
 * (the owner's own words: « je vois pas panier sur page »). A cart icon is
 * the single most recognised e-commerce affordance there is; hiding it
 * doesn't reduce noise, it removes the signal that batching purchases is
 * possible. Rendered from hydration onward — before that, nothing, so the
 * badge can never flash a wrong count.
 */
export function CartLink() {
  const t = useTranslations('panye');
  const cart = useCart();
  if (!cart || !cart.hydrated) return null;

  return (
    <Link
      href="/panye"
      aria-label={t('linkLabel', { count: cart.count })}
      className="relative flex items-center text-ink/70 transition-colors hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
    >
      <IconShoppingCart size={20} />
      {cart.count > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-ochre px-1 font-mono text-[10px] font-bold leading-none text-[#1b1207]">
          {cart.count}
        </span>
      )}
    </Link>
  );
}
