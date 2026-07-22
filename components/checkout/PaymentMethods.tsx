'use client';

import { useState } from 'react';
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
import { buttonClasses } from '@/components/ui/Button';

const METHODS = [
  { id: 'paypal', label: 'PayPal', Icon: IconBrandPaypal },
  { id: 'card', label: 'Visa / Mastercard', Icon: IconCreditCard },
  { id: 'moncash', label: 'MonCash', Icon: IconDeviceMobile },
  { id: 'natcash', label: 'NatCash', Icon: IconDeviceMobile },
  { id: 'crypto', label: 'Crypto', Icon: IconCoin },
];

export function PaymentMethods({
  payLabel,
  active,
  productType,
  courseSlug,
}: {
  payLabel: string;
  active?: string[];
  productType: 'course' | 'subscription';
  courseSlug: string | null;
}) {
  const t = useTranslations('checkout');
  const tc = useTranslations('common');
  const locale = useLocale();
  // Providers can be toggled off from the admin platform settings.
  const methods = active ? METHODS.filter((m) => active.includes(m.id)) : METHODS;
  const [selected, setSelected] = useState(methods[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Card is the only live rail in C1-P1 (MonCash lands in C1-P2).
  const isLive = selected === 'card';

  async function pay() {
    if (!isLive || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType, courseSlug, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return; // keep the spinner while the browser navigates
      }
      setError(true);
      setBusy(false);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-ink">{t('methodTitle')}</h2>

      <ul className="mt-5 space-y-2.5">
        {methods.map(({ id, label, Icon }) => {
          const isActive = selected === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => { setSelected(id); setError(false); }}
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

      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className={buttonClasses('primary', 'lg', 'mt-6 w-full disabled:opacity-60')}
      >
        {busy && <IconLoader2 size={18} className="mr-2 animate-spin" />}
        {busy ? t('redirect') : payLabel}
        {!isLive && !busy && (
          <span className="ml-2 rounded bg-[#1b1207]/15 px-1.5 py-0.5 font-mono text-[10px] uppercase">
            {tc('demo')}
          </span>
        )}
      </button>

      {error && (
        <p className="mt-3 text-center font-mono text-[11px] text-stampred" role="alert">
          {t('payErr')}
        </p>
      )}

      <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-graphite/55">
        {t('demoNote')}
      </p>
    </div>
  );
}
