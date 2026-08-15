'use client';

import { useEffect } from 'react';
import { useCart } from '@/components/cart/cart-context';

/**
 * Rendered by the merci page after a CONFIRMED wallet purchase: takes the
 * bought items back out of the localStorage cart, so the buyer doesn't find
 * a basket still "owing" what they just paid for.
 *
 * Surgical on purpose: a basket purchase (`count` > 1) clears the whole
 * cart — everything in it was just bought — while a direct single-course
 * purchase removes only THAT course, leaving whatever else the buyer was
 * still planning to buy untouched. Renders nothing; idempotent (clearing an
 * empty cart is a no-op), so refreshes of the merci page are harmless.
 */
export function ClearCartOnSuccess({ courseSlug, count }: { courseSlug: string | null; count: number }) {
  const cart = useCart();
  useEffect(() => {
    if (!cart || !cart.hydrated) return;
    if (count > 1) cart.clear();
    else if (courseSlug) cart.remove(courseSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on hydration only
  }, [cart?.hydrated]);
  return null;
}
