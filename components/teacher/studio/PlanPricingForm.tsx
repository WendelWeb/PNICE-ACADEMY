'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconLoader2, IconCheck, IconPencil, IconAlertTriangle, IconReceipt2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { updateMyPlanAction } from '@/lib/teacher/studio-actions';
import { PLAN_PRICE_MIN_CENTS, PLAN_PRICE_MAX_CENTS } from '@/lib/teacher/apply-validation';
import { toHtgAt } from '@/lib/money';

const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-ochre focus-visible:ring-2 focus-visible:ring-ochre/25';
const labelCls = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-ink/55';
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

const KNOWN_ERRORS = ['invalid_price', 'forbidden', 'db_required'] as const;

/**
 * The studio's "Mon abonnement" panel (Task: per-teacher plan pricing — a
 * gap flagged since C3: a teacher could not change their own monthly
 * subscription price without going through SQL directly). Calls
 * `updateMyPlanAction`, which is owner-scoped server-side (writes only the
 * signed-in teacher's own `teacher_plans` row, resolved from their Clerk
 * session — never a param) — this form only ever edits "my" price, same
 * shape as `PayoutSettingsForm`.
 *
 * `priceCentsMonthly` is the CURRENT effective price the caller resolved
 * (their own plan row if they have one, else the platform default) — see
 * app/[locale]/(site)/enseigner/studio/page.tsx.
 */
export function PlanPricingForm({
  priceCentsMonthly,
  fxRateHtg,
}: {
  priceCentsMonthly: number;
  fxRateHtg: number;
}) {
  const t = useTranslations('teach.studio.plan');
  const tc = useTranslations('common');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(priceCentsMonthly / 100));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const currentUsd = priceCentsMonthly / 100;
  const currentHtg = toHtgAt(currentUsd, fxRateHtg);

  function submit() {
    const usd = Number(val);
    const cents = Math.round(usd * 100);
    start(async () => {
      setMsg(null);
      const res = await updateMyPlanAction({ priceCentsMonthly: cents });
      if (res.ok) {
        setMsg({ type: 'ok', text: t('success') });
        setEditing(false);
        router.refresh();
      } else {
        const key =
          res.message && (KNOWN_ERRORS as readonly string[]).includes(res.message) ? res.message : 'generic';
        setMsg({
          type: 'err',
          text: t(`error.${key}`, { min: PLAN_PRICE_MIN_CENTS / 100, max: PLAN_PRICE_MAX_CENTS / 100 }),
        });
      }
    });
  }

  function cancel() {
    setVal(String(priceCentsMonthly / 100));
    setMsg(null);
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border border-ink/12 bg-paper-light p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconReceipt2 size={16} className="text-ink/50" />
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">{t('title')}</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn('inline-flex items-center gap-1 rounded font-mono text-[11px] text-ochre hover:underline', focusRing)}
          >
            <IconPencil size={13} /> {t('editCta')}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-graphite/70">{t('explain')}</p>

      {!editing ? (
        <p className="mt-3 text-sm font-semibold text-ink">
          {t('current', { usd: currentUsd, htg: currentHtg.toLocaleString('fr-FR') })}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="plan-price" className={labelCls}>
              {t('priceLabel')}
            </label>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm text-ink/55">$</span>
              <input
                id="plan-price"
                type="number"
                min={PLAN_PRICE_MIN_CENTS / 100}
                max={PLAN_PRICE_MAX_CENTS / 100}
                step="1"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                className={cn(inputCls, focusRing, 'max-w-[140px]')}
              />
              <span className="font-mono text-xs text-graphite/55">{tc('perMonth')}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={submit} className={cn(buttonClasses('primary', 'sm'), focusRing)}>
              {pending ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
              {t('save')}
            </button>
            <button type="button" onClick={cancel} className={cn(buttonClasses('ghost', 'sm'), focusRing)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={cn('mt-3 flex items-center gap-1.5 font-mono text-[11px]', msg.type === 'ok' ? 'text-teal' : 'text-stampred')}>
          {msg.type === 'err' && <IconAlertTriangle size={12} />} {msg.text}
        </p>
      )}
    </div>
  );
}
