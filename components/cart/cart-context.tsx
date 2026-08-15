'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MAX_CART_ITEMS } from '@/lib/payments/cart';

/**
 * One cart line — a DISPLAY snapshot taken when the buyer tapped « ajoute ».
 * Title and price exist only so the panye page can render offline-fast;
 * checkout re-resolves every slug server-side and charges the REAL current
 * price, so a stale snapshot can mislabel a row but can never mischarge.
 */
export type CartItem = { slug: string; title: string; priceUsd: number };

type CartApi = {
  items: CartItem[];
  count: number;
  has(slug: string): boolean;
  add(item: CartItem): void;
  remove(slug: string): void;
  clear(): void;
  /** False until localStorage has been read — see `hydrated` below. */
  hydrated: boolean;
};

const CartContext = createContext<CartApi | null>(null);

const STORAGE_KEY = 'pnice-panye-v1';

function readStored(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is CartItem =>
          typeof i === 'object' && i !== null &&
          typeof (i as CartItem).slug === 'string' &&
          typeof (i as CartItem).title === 'string' &&
          typeof (i as CartItem).priceUsd === 'number',
      )
      .slice(0, MAX_CART_ITEMS);
  } catch {
    return [];
  }
}

/**
 * The « panye » lives in localStorage, per browser, signed-in or not — a
 * visitor can fill it before creating an account, and it survives the
 * sign-in redirect. Server-side state would buy nothing here: the cart is
 * pure intent, and everything that matters (prices, ownership, publication)
 * is re-checked by the checkout route at pay time.
 *
 * `hydrated` exists because the server render knows nothing of localStorage:
 * consumers render a neutral state until the first client effect has read
 * the store, so the header badge never flashes a wrong count.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Full/blocked storage degrades to a session-only cart — never a crash.
    }
  }, [items, hydrated]);

  const api = useMemo<CartApi>(
    () => ({
      items,
      count: items.length,
      hydrated,
      has: (slug) => items.some((i) => i.slug === slug),
      add: (item) =>
        setItems((prev) =>
          prev.some((i) => i.slug === item.slug) || prev.length >= MAX_CART_ITEMS
            ? prev
            : [...prev, item],
        ),
      remove: (slug) => setItems((prev) => prev.filter((i) => i.slug !== slug)),
      clear: () => setItems([]),
    }),
    [items, hydrated],
  );

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

/** Null outside the provider (admin route group) — callers render nothing. */
export function useCart(): CartApi | null {
  return useContext(CartContext);
}
