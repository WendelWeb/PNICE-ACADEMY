'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconReceipt2, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { fmtDateTime } from '@/lib/admin/format';
import { setPlatformPassPriceAction, setPlatformPassEnabledAction } from '@/lib/admin/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * The "Pass PNICE" (all-access) price editor — /admin/prix. Mirrors
 * components/admin/tx/FxRatePanel.tsx exactly (same layout, same
 * useTransition + inline status message pattern, same capability-gated
 * `canEdit` prop) since it's the same kind of owner-only, DB-backed platform
 * setting (Task: two subscription products).
 */
export function PlatformPricePanel({
  priceUsd,
  updatedAt,
  canEdit,
  locale,
  passEnabled,
}: {
  priceUsd: number;
  updatedAt: string | null;
  canEdit: boolean;
  locale: 'ht' | 'fr';
  /** The pass master switch (owner: « bouton pour désactiver ») — OFF hides
   *  every public sales surface; existing subscribers keep access. */
  passEnabled: boolean;
}) {
  const t = useTranslations('admin.prix.panel');
  const router = useRouter();
  const [val, setVal] = useState(String(priceUsd));
  const [pending, start] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const setEnabled = (enabled: boolean) =>
    startToggle(async () => {
      setMsg(null);
      const res = await setPlatformPassEnabledAction(enabled);
      if (res.ok) {
        setMsg({ type: 'ok', text: t('saved') });
        router.refresh();
      } else {
        setMsg({ type: 'err', text: t('error') });
      }
    });

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconReceipt2 size={13} /> {t('title')}
      </h2>
      <p className="mt-2 text-xs text-graphite/70">{t('help')}</p>

      {/* MASTER SWITCH — sell the pass, or take it off every shelf. The
          help line says the one thing that matters: current subscribers
          keep their access either way. */}
      <div className="mt-3 rounded-lg border border-ink/10 bg-paper p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('saleTitle')}</span>
          <button
            type="button"
            disabled={!canEdit || togglePending}
            onClick={() => setEnabled(true)}
            className={cn(buttonClasses(passEnabled ? 'primary' : 'ghost', 'sm'), 'text-[11px]')}
          >
            {t('saleOn')}
          </button>
          <button
            type="button"
            disabled={!canEdit || togglePending}
            onClick={() => setEnabled(false)}
            className={cn(buttonClasses(!passEnabled ? 'primary' : 'ghost', 'sm'), 'text-[11px]')}
          >
            {t('saleOff')}
          </button>
          {togglePending && <IconLoader2 size={14} className="animate-spin text-ink/40" />}
        </div>
        <p className={cn('mt-1.5 text-[11px] leading-snug', passEnabled ? 'text-graphite/60' : 'text-ochre')}>
          {passEnabled ? t('saleOnNote') : t('saleOffNote')}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(val);
          start(async () => {
            setMsg(null);
            const res = await setPlatformPassPriceAction(n);
            if (res.ok) {
              setMsg({ type: 'ok', text: t('saved') });
              router.refresh();
            } else {
              setMsg({ type: 'err', text: res.message === 'invalid_price' ? t('invalid') : t('error') });
            }
          });
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('label')}</span>
          <span className="flex items-center gap-1 font-mono text-xs text-ink/55">
            $
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={val}
              disabled={!canEdit || pending}
              onChange={(e) => setVal(e.target.value)}
              className={cn('w-24 rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-sm text-ink', focusRing, !canEdit && 'opacity-60')}
            />
            {t('perMonth')}
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
