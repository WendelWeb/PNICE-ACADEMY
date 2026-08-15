'use client';

import { useTranslations } from 'next-intl';
import { IconShoppingCart } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { useCart } from '@/components/cart/cart-context';

/**
 * The header's cart entry — IN THE SERVER HTML, always.
 *
 * Twice burned into this component's history: it first hid while empty
 * ("this shop has no cart"), then it hid until hydration — which on a slow
 * phone, a failed chunk, or data-saver mode means it never appears at all.
 * The owner saw exactly that: « aucun changement ». The icon and its /panye
 * link are now part of the FIRST paint (a 'use client' component still
 * server-renders its initial markup — the old `hydrated` gate was the only
 * thing keeping it out of the HTML). Only the count badge waits for
 * hydration, because only IT depends on localStorage — so it can never
 * flash a wrong number, and the icon never depends on JavaScript to exist.
 */
export function CartLink() {
  const t = useTranslations('panye');
  const cart = useCart();
  const count = cart?.hydrated ? cart.count : 0;

  return (
    <Link
      href="/panye"
      aria-label={t('linkLabel', { count })}
      className="relative flex items-center text-ink/70 transition-colors hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
    >
      <IconShoppingCart size={20} />
      {count > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-ochre px-1 font-mono text-[10px] font-bold leading-none text-[#1b1207]">
          {count}
        </span>
      )}
    </Link>
  );
}
