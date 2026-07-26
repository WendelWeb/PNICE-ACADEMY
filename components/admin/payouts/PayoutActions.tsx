'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCheck, IconX, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import {
  markWithdrawalPaidAction,
  rejectWithdrawalAction,
  type PayoutActionResult,
} from '@/lib/teacher/payout-actions';
import type { WithdrawalRow } from '@/lib/teacher/profile';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

type Feedback = { type: 'ok' | 'err'; text: string } | null;
type Mode = 'pay' | 'reject' | null;

/** Mark-paid(+reference) / reject(+note) for one pending withdrawal row. No-op (renders nothing) once the row leaves 'pending'. */
export function PayoutActions({ id, status }: { id: string; status: WithdrawalRow['status'] }) {
  const t = useTranslations('admin.payouts.actions');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [value, setValue] = useState('');

  if (status !== 'pending') return null;

  const run = (fn: () => Promise<PayoutActionResult>) =>
    start(async () => {
      setFeedback(null);
      const res = await fn();
      if (res.ok) {
        setFeedback({ type: 'ok', text: t('done') });
        setMode(null);
        setValue('');
        router.refresh();
      } else {
        setFeedback({ type: 'err', text: t('error') });
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => setMode('pay')}
          className={cn(buttonClasses('dark', 'sm'), 'gap-1')}
        >
          <IconCheck size={13} /> {t('markPaid')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setMode('reject')}
          className={cn(
            'flex items-center gap-1 rounded border border-stampred/40 px-3.5 py-1.5 text-xs font-semibold text-stampred hover:bg-stampred/10',
            focusRing,
          )}
        >
          <IconX size={13} /> {t('reject')}
        </button>
        {pending && <IconLoader2 size={15} className="animate-spin text-ink/40" />}
      </div>
      {feedback && (
        <p className={cn('font-mono text-[11px]', feedback.type === 'ok' ? 'text-teal' : 'text-stampred')} role="status">
          {feedback.text}
        </p>
      )}

      {mode && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">
                {mode === 'pay' ? t('markPaid') : t('reject')}
              </h3>
              <button
                type="button"
                onClick={() => setMode(null)}
                className={cn('text-ink/50 hover:text-ink', focusRing)}
                aria-label={t('cancel')}
              >
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-graphite/70">
              {mode === 'pay' ? t('referenceHelp') : t('noteHelp')}
            </p>
            {mode === 'pay' ? (
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t('referencePlaceholder')}
                className={cn(
                  'mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink',
                  focusRing,
                )}
              />
            ) : (
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={3}
                placeholder={t('notePlaceholder')}
                className={cn(
                  'mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink',
                  focusRing,
                )}
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setMode(null)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!value.trim() || pending}
                onClick={() =>
                  run(() => (mode === 'pay' ? markWithdrawalPaidAction(id, value) : rejectWithdrawalAction(id, value)))
                }
                className={cn(
                  'flex items-center gap-1.5 rounded px-4 py-2.5 text-xs font-semibold text-paper-light disabled:opacity-50',
                  mode === 'pay' ? 'bg-teal' : 'bg-stampred',
                  focusRing,
                )}
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
