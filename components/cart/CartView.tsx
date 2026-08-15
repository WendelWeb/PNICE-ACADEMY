'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  IconTrash,
  IconLoader2,
  IconDeviceMobile,
  IconCheck,
  IconShoppingCart,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { formatUsd, formatHtg, toHtgAt } from '@/lib/money';
import { useCart } from '@/components/cart/cart-context';
import type { CheckoutMethod } from '@/components/checkout/PaymentMethods';

/**
 * The « panye » page body: the lines, the honest totals, and the pay flow.
 *
 * Everything money-critical mirrors the single-course checkout: the methods
 * offered are resolved SERVER-side and passed in (only wallets can sell a
 * basket today), the HTG figure shown is `toHtgAt` of the USD total at the
 * live rate — the same arithmetic the checkout route charges — and the
 * server re-validates every slug, every price and every ownership at pay
 * time. This component's own prices are display snapshots, nothing more.
 */
export function CartView({
  methods,
  fxRateHtg,
}: {
  /** Live wallet rails, resolved server-side (splitProviders). */
  methods: CheckoutMethod[];
  fxRateHtg: number;
}) {
  const t = useTranslations('panye');
  const tc = useTranslations('checkout');
  const locale = useLocale();
  const cart = useCart();
  const [selected, setSelected] = useState(methods[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!cart || !cart.hydrated) {
    return <IconLoader2 size={22} className="mx-auto mt-16 animate-spin text-ink/40" />;
  }

  if (cart.count === 0) {
    return (
      <div className="mx-auto mt-14 max-w-md rounded-2xl border border-ink/12 bg-paper-light p-8 text-center">
        <IconShoppingCart size={30} className="mx-auto text-ink/30" />
        <p className="mt-4 font-display text-xl font-bold text-ink">{t('empty.title')}</p>
        <p className="mt-2 text-sm leading-relaxed text-graphite/75">{t('empty.body')}</p>
        <Link href="/formations" className={buttonClasses('primary', 'md', 'mt-6 inline-flex')}>
          {t('empty.cta')}
        </Link>
      </div>
    );
  }

  const totalUsd = cart.items.reduce((a, i) => a + i.priceUsd, 0);
  const walletName = selected === 'natcash' ? 'NatCash' : 'MonCash';

  async function pay() {
    if (!cart || !selected || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const endpoint = selected === 'natcash' ? '/api/checkout/natcash' : '/api/checkout/moncash';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productType: 'course',
          courseSlugs: cart.items.map((i) => i.slug),
          locale,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        courseSlug?: string;
      };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return; // keep the spinner while the browser navigates
      }
      if (res.status === 401) {
        // Signed out: the wallet routes require an account to attach the
        // purchase to. Send them to sign in and come straight back here.
        window.location.assign(`/${locale}/sign-in?redirect_url=${encodeURIComponent(`/${locale}/panye`)}`);
        return;
      }
      if (data.error === 'already_owned' && data.courseSlug) {
        // The server names WHICH course is already owned — drop that line
        // and let the buyer retry with the rest, instead of a dead end.
        const owned = cart.items.find((i) => i.slug === data.courseSlug);
        cart.remove(data.courseSlug);
        setErrorMsg(t('err.ownedRemoved', { title: owned?.title ?? data.courseSlug }));
      } else if (data.error === 'unknown_product' && data.courseSlug) {
        // Unpublished/removed since it was added — same self-healing.
        const gone = cart.items.find((i) => i.slug === data.courseSlug);
        cart.remove(data.courseSlug);
        setErrorMsg(t('err.goneRemoved', { title: gone?.title ?? data.courseSlug }));
      } else if (data.error === 'cart_unavailable') {
        setErrorMsg(t('err.unavailable'));
      } else if (data.error === 'amount_too_large') {
        setErrorMsg(tc('walletAmountTooLarge', { wallet: walletName }));
      } else if (data.error === 'moncash_unreachable') {
        setErrorMsg(tc('moncashDown'));
      } else if (data.error === 'natcash_unreachable' || data.error === 'natcash_error') {
        setErrorMsg(tc('natcashDown'));
      } else {
        setErrorMsg(tc('payErr'));
      }
      setBusy(false);
    } catch {
      setErrorMsg(tc('payErr'));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-10 grid max-w-4xl gap-8 md:grid-cols-[1.2fr_0.8fr]">
      {/* the lines */}
      <div className="rounded-2xl border border-ink/15 bg-paper p-6">
        <ul className="divide-y divide-ink/10">
          {cart.items.map((item) => (
            <li key={item.slug} className="flex items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/formations/${item.slug}`}
                  className="block truncate font-display text-[15px] font-bold text-ink hover:text-teal"
                >
                  {item.title}
                </Link>
              </div>
              <span className="shrink-0 font-display text-base font-black text-ink tabular-nums">
                {formatUsd(item.priceUsd)}
              </span>
              <button
                type="button"
                onClick={() => cart.remove(item.slug)}
                aria-label={t('removeLabel', { title: item.title })}
                className="shrink-0 rounded p-1.5 text-ink/40 transition-colors hover:bg-stampred/10 hover:text-stampred focus-visible:outline focus-visible:outline-2 focus-visible:outline-ochre"
              >
                <IconTrash size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-ink/10 pt-4">
          <span className="font-mono text-sm uppercase tracking-wide text-ink/60">{tc('total')}</span>
          <div className="text-right">
            <p className="font-display text-2xl font-black text-ink tabular-nums">{formatUsd(totalUsd)}</p>
            {/* The EXACT debit, not an estimate: same conversion the wallet
                route charges, at the same live rate — no tilde. */}
            <p className="font-mono text-xs text-graphite/70 tabular-nums">
              {formatHtg(toHtgAt(totalUsd, fxRateHtg))}
            </p>
          </div>
        </div>
      </div>

      {/* the pay box */}
      <div>
        <div className="rounded-2xl border border-ink/15 bg-paper p-6">
          <h2 className="font-display text-lg font-bold text-ink">{tc('methodTitle')}</h2>
          {methods.length === 0 ? (
            <p className="mt-4 rounded-lg border border-ink/15 bg-paper-light p-4 text-sm leading-relaxed text-graphite/75">
              {tc('noMethods')}
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {methods.map(({ id, label }) => {
                  const isActive = selected === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => { setSelected(id); setErrorMsg(null); }}
                        disabled={busy}
                        aria-pressed={isActive}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border bg-paper-light p-3.5 text-left transition-colors',
                          isActive ? 'border-ochre ring-1 ring-ochre' : 'border-ink/15 hover:border-ink/35',
                        )}
                      >
                        <IconDeviceMobile size={20} className="shrink-0 text-ink/70" />
                        <span className="flex-1 text-sm font-medium text-ink">{label}</span>
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-full border',
                            isActive ? 'border-ochre bg-ochre text-[#1b1207]' : 'border-ink/25',
                          )}
                        >
                          {isActive && <IconCheck size={13} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={pay}
                disabled={busy || !selected}
                className={buttonClasses('primary', 'lg', 'mt-5 w-full disabled:opacity-60')}
              >
                {busy && <IconLoader2 size={18} className="mr-2 animate-spin" />}
                {busy
                  ? tc('redirect')
                  : t('payCta', { count: cart.count, amount: formatUsd(totalUsd) })}
              </button>
            </>
          )}
          {errorMsg && (
            <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-stampred" role="alert">
              {errorMsg}
            </p>
          )}
          {methods.length > 0 && (
            <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-graphite/55">
              {tc('secureNote')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
