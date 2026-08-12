'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  IconBrandPaypal,
  IconCreditCard,
  IconDeviceMobile,
  IconCoin,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { formatUsd } from '@/lib/money';
import { buttonClasses } from '@/components/ui/Button';
import { usePromoContext } from './promo-context';

/** Icon per rail — display only; which rails APPEAR is decided server-side. */
const METHOD_ICONS: Record<string, typeof IconCreditCard> = {
  card: IconCreditCard,
  paypal: IconBrandPaypal,
  moncash: IconDeviceMobile,
  natcash: IconDeviceMobile,
  crypto: IconCoin,
};

export type CheckoutMethod = { id: string; label: string };

/** Promo reasons with a dedicated message (mirrors checkout.promo.error.*). */
const PROMO_REASONS = new Set([
  'not_found',
  'inactive',
  'expired',
  'depleted',
  'scheduled',
  'wrong_product',
  'too_small',
]);

/**
 * Stage: checkout honesty — this component now renders ONLY rails with a
 * real, live charge path (lib/payments/providers.ts's `activeProviders`,
 * resolved by the page server-side): every selectable method really charges,
 * so the old demo badge / silent no-op pay button are gone. Rails that are
 * toggled on but not built yet arrive as `comingSoon` — small, quiet,
 * NON-interactive chips, clearly future, never selectable.
 */
export function PaymentMethods({
  payLabel,
  methods,
  comingSoon,
  productType,
  courseSlug,
  teacherSlug,
}: {
  payLabel: string;
  /** Live rails only — toggled ∩ implemented, resolved server-side. */
  methods: CheckoutMethod[];
  /** Toggled-on rails with no charge path yet — announced, never selectable. */
  comingSoon: CheckoutMethod[];
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  /** Task: per-teacher subscription checkout — `/prof/[slug]`'s own slug,
   *  when this is a per-teacher subscription purchase; `null` charges the
   *  platform default, same as before this task. */
  teacherSlug?: string | null;
}) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const [selected, setSelected] = useState(methods[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  /** Set once a MonCash cash-out request is sitting on the buyer's handset. */
  const [waiting, setWaiting] = useState<{ orderId: string; amountHtg: number } | null>(null);

  /**
   * MonCash never redirects and never calls back to this page — the buyer
   * approves on their phone and nothing here would otherwise know. So while a
   * request is outstanding we ask our own status endpoint (which re-checks
   * MonCash and grants access the moment it clears) every 3 seconds.
   *
   * Bounded at 3 minutes: MonCash's own prompt expires around there, and an
   * unbounded poller would hammer the endpoint forever in a tab someone left
   * open. Timing out only stops the ASKING — if the buyer approves later, the
   * order still settles through Digicel's callback, so nobody loses access
   * they paid for.
   */
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (stop) return;
      try {
        const res = await fetch(
          `/api/payments/moncash/status?orderId=${encodeURIComponent(waiting.orderId)}`,
        );
        const data = (await res.json().catch(() => ({}))) as { status?: string };

        if (data.status === 'granted' || data.status === 'already') {
          stop = true;
          window.location.assign(`/${locale}/checkout/merci?moncash=1`);
          return;
        }
        if (data.status === 'unpaid') {
          stop = true;
          setWaiting(null);
          setErrorMsg(t('moncashDeclined'));
          return;
        }
      } catch {
        // A dropped poll is not a failed payment — keep waiting.
      }
      if (!stop && Date.now() - startedAt > 3 * 60 * 1000) {
        stop = true;
        setWaiting(null);
        setErrorMsg(t('moncashTimeout'));
        return;
      }
      if (!stop) timer = setTimeout(tick, 3000);
    };

    let timer = setTimeout(tick, 3000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [waiting, locale, t]);

  // The applied promo (if any) — the CODE goes to /api/checkout, which
  // re-validates it and prices the Stripe session itself; the netCents here
  // only keeps the button label honest about what that charge will be.
  const promo = usePromoContext();
  const applied = promo?.applied ?? null;
  const buttonLabel = applied ? `${t('pay')} ${formatUsd(applied.netCents / 100)}` : payLabel;

  async function pay() {
    if (!selected || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      // Each rail has its own endpoint because each speaks a different
      // protocol: Stripe hands back a hosted-checkout URL, MonCash hands back
      // MonCash returns an order id and pushes the request to the buyer's
      // phone — no redirect at all. Both shapes are handled below.
      const endpoint = selected === 'moncash' ? '/api/checkout/moncash' : '/api/checkout';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productType,
          courseSlug,
          teacherSlug: teacherSlug ?? null,
          promoCode: applied?.code ?? null,
          locale,
          ...(selected === 'moncash' ? { phone } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        orderId?: string;
        amountHtg?: number;
        error?: string;
        reason?: string;
      };
      // Stripe hands back a hosted-checkout URL to send the buyer to…
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return; // keep the spinner while the browser navigates
      }
      // …MonCash hands back an order id: the request is now on their phone,
      // and the poller above takes it from here.
      if (res.ok && data.orderId) {
        setWaiting({ orderId: data.orderId, amountHtg: data.amountHtg ?? 0 });
        setBusy(false);
        return;
      }
      if (data.error === 'bad_phone') {
        setErrorMsg(t('moncashBadPhone'));
        setBusy(false);
        return;
      }
      // Honest failure messages: the server says exactly WHY it refused.
      if (data.error === 'already_owned') {
        setErrorMsg(t('owned.payRefused'));
      } else if (data.error === 'checkout_processing') {
        // Pending-checkout guard (launch review fix): a payment for this
        // exact item already landed on Stripe's side and the webhook just
        // hasn't caught up yet — never a silent generic "try again" that
        // would invite a genuine second charge attempt.
        setErrorMsg(t('payPending'));
      } else if (data.error === 'promo_invalid') {
        setErrorMsg(
          data.reason && PROMO_REASONS.has(data.reason)
            ? t(`promo.error.${data.reason}`)
            : t('promo.payInvalid'),
        );
      } else if (data.error === 'subscription_unsupported') {
        // MonCash cannot renew anything — say so plainly instead of a generic
        // failure the buyer would just retry.
        setErrorMsg(t('moncashSubscription'));
      } else if (data.error === 'promo_unsupported') {
        setErrorMsg(t('moncashPromo'));
      } else {
        setErrorMsg(t('payErr'));
      }
      setBusy(false);
    } catch {
      setErrorMsg(t('payErr'));
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-ink">{t('methodTitle')}</h2>

      {methods.length > 0 ? (
        <ul className="mt-5 space-y-2.5">
          {methods.map(({ id, label }) => {
            const Icon = METHOD_ICONS[id] ?? IconCreditCard;
            const isActive = selected === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => { setSelected(id); setErrorMsg(null); }}
                  disabled={busy}
                  aria-pressed={isActive}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border bg-paper-light p-4 text-left transition-colors',
                    isActive
                      ? 'border-ochre ring-1 ring-ochre'
                      : 'border-ink/15 hover:border-ink/35',
                  )}
                >
                  <Icon size={22} className="shrink-0 text-ink/70" />
                  <span className="flex-1 font-medium text-ink">{label}</span>
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
      ) : (
        // Every live rail toggled off by the admin — say so plainly instead
        // of rendering a pay button that cannot charge.
        <p className="mt-5 rounded-lg border border-ink/15 bg-paper-light p-4 text-sm leading-relaxed text-graphite/75">
          {t('noMethods')}
        </p>
      )}

      {/* Future rails: a quiet, non-interactive announcement row — plain
          spans, no buttons, so nothing here can ever be "selected". */}
      {comingSoon.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
            {t('comingSoonTitle')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label={t('comingSoonTitle')}>
            {comingSoon.map(({ id, label }) => (
              <li
                key={id}
                className="flex items-center gap-1.5 rounded border border-dashed border-ink/20 px-2.5 py-1 font-mono text-[11px] text-ink/45"
              >
                {label}
                <span className="rounded bg-ink/10 px-1 py-px text-[9px] uppercase tracking-wide">
                  {t('comingSoonChip')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* MonCash asks for the buyer's own wallet number: the cash-out request
          is pushed to that handset, so a wrong number means a prompt that
          never arrives. Only shown for the rail that needs it. */}
      {selected === 'moncash' && waiting === null && (
        <div className="mt-5">
          <label
            htmlFor="moncash-phone"
            className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink/60"
          >
            {t('moncashPhoneLabel')}
          </label>
          <p className="mt-1 text-[11px] leading-snug text-ink/60">{t('moncashPhoneHint')}</p>
          <input
            id="moncash-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="3866 2809"
            className="mt-2 w-full rounded border border-ink/20 bg-paper-light px-3 py-2.5 font-mono text-base text-ink placeholder:text-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
          />
        </div>
      )}

      {/* Waiting on the handset. The buyer must be told to go look at their
          phone — nothing on this screen will change until they approve. */}
      {waiting && (
        <div
          className="mt-6 rounded border border-ochre/40 bg-ochre/[0.07] p-4 text-center"
          role="status"
          aria-live="polite"
        >
          <IconLoader2 size={22} className="mx-auto animate-spin text-ochre" />
          <p className="mt-2 font-display text-lg font-bold text-ink">{t('moncashWaitTitle')}</p>
          <p className="mt-1 text-[13px] leading-snug text-ink/70">
            {t('moncashWaitBody', { amount: waiting.amountHtg.toLocaleString('fr-FR') })}
          </p>
        </div>
      )}

      {methods.length > 0 && !waiting && (
        <button
          type="button"
          onClick={pay}
          disabled={busy}
          className={buttonClasses('primary', 'lg', 'mt-6 w-full disabled:opacity-60')}
        >
          {busy && <IconLoader2 size={18} className="mr-2 animate-spin" />}
          {busy ? t('redirect') : buttonLabel}
        </button>
      )}

      {errorMsg && (
        <p className="mt-3 text-center font-mono text-[11px] text-stampred" role="alert">
          {errorMsg}
        </p>
      )}

      {methods.length > 0 && (
        <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-graphite/55">
          {t('secureNote')}
        </p>
      )}
    </div>
  );
}
