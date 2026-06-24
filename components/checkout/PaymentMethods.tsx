'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconBrandPaypal,
  IconCreditCard,
  IconDeviceMobile,
  IconCoin,
  IconCheck,
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

export function PaymentMethods({ payLabel, active }: { payLabel: string; active?: string[] }) {
  const t = useTranslations('checkout');
  const tc = useTranslations('common');
  // Providers can be toggled off from the admin platform settings.
  const methods = active ? METHODS.filter((m) => active.includes(m.id)) : METHODS;
  const [selected, setSelected] = useState(methods[0]?.id ?? '');

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-ink">
        {t('methodTitle')}
      </h2>

      <ul className="mt-5 space-y-2.5">
        {methods.map(({ id, label, Icon }) => {
          const active = selected === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setSelected(id)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border bg-paper-light p-4 text-left transition-colors',
                  active
                    ? 'border-ochre ring-1 ring-ochre'
                    : 'border-ink/15 hover:border-ink/35',
                )}
              >
                <Icon size={22} className="shrink-0 text-ink/70" />
                <span className="flex-1 font-medium text-ink">{label}</span>
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    active ? 'border-ochre bg-ochre text-[#1b1207]' : 'border-ink/25',
                  )}
                >
                  {active && <IconCheck size={13} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className={buttonClasses('primary', 'lg', 'mt-6 w-full')}
      >
        {payLabel}
        <span className="ml-2 rounded bg-[#1b1207]/15 px-1.5 py-0.5 font-mono text-[10px] uppercase">
          {tc('demo')}
        </span>
      </button>

      <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-graphite/55">
        {t('demoNote')}
      </p>
    </div>
  );
}
