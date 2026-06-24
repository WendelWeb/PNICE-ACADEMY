'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCurrencyDollar, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { fmtDateTime } from '@/lib/admin/format';
import { setFxRateAction } from '@/lib/admin/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

export function FxRatePanel({
  rate,
  updatedAt,
  canEdit,
  locale,
}: {
  rate: number;
  updatedAt: string;
  canEdit: boolean;
  locale: 'ht' | 'fr';
}) {
  const t = useTranslations('admin.tx.fx');
  const router = useRouter();
  const [val, setVal] = useState(String(rate));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconCurrencyDollar size={13} /> {t('title')}
      </h2>
      <p className="mt-2 text-xs text-graphite/70">{t('help')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(val);
          start(async () => {
            setMsg(null);
            const res = await setFxRateAction(n);
            if (res.ok) {
              setMsg({ type: 'ok', text: t('saved') });
              router.refresh();
            } else {
              setMsg({ type: 'err', text: res.message === 'invalid_rate' ? t('invalid') : t('error') });
            }
          });
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('label')}</span>
          <span className="flex items-center gap-1 font-mono text-xs text-ink/55">
            1 USD =
            <input
              type="number"
              step="0.5"
              min="1"
              value={val}
              disabled={!canEdit || pending}
              onChange={(e) => setVal(e.target.value)}
              className={cn('w-24 rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-sm text-ink', focusRing, !canEdit && 'opacity-60')}
            />
            HTG
          </span>
        </label>
        {canEdit && (
          <button type="submit" disabled={pending} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
            {pending ? <IconLoader2 size={15} className="animate-spin" /> : null}
            {t('save')}
          </button>
        )}
      </form>

      <p className="mt-2 font-mono text-[10px] text-ink/45">
        {t('updated')}: {fmtDateTime(updatedAt, locale)}
      </p>
      {!canEdit && <p className="mt-1 font-mono text-[10px] text-ink/40">{t('readonly')}</p>}
      {msg && (
        <p className={cn('mt-1 font-mono text-[11px]', msg.type === 'ok' ? 'text-teal' : 'text-stampred')} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
