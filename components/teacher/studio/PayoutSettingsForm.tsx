'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconLoader2, IconCheck, IconPencil, IconAlertTriangle, IconWallet } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { updateMyPayoutSettingsAction } from '@/lib/teacher/studio-actions';
import { PAYOUT_METHODS, PAYOUT_DESTINATION_MAX_LENGTH, type PayoutMethod } from '@/lib/teacher/apply-validation';

const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus-visible:border-ochre focus-visible:ring-2 focus-visible:ring-ochre/25';
const labelCls = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-ink/55';
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

const KNOWN_ERRORS = [
  'payout_method_invalid',
  'payout_destination_required',
  'payout_destination_too_long',
  'forbidden',
  'db_required',
] as const;

/**
 * The studio's payout-settings card (Task C3 fix): an approved teacher
 * (incl. the owner) previously had no in-app way to set/change how they get
 * paid once past the one-time apply wizard — `requestWithdrawalAction`
 * (WithdrawalPanel) hard-refuses a withdrawal without both fields set. This
 * calls `updateMyPayoutSettingsAction`, which is owner-scoped server-side
 * (writes only the signed-in teacher's own `teacher_profiles` row, resolved
 * from their Clerk session — never a param) — this form only ever edits
 * "my" settings.
 *
 * Starts in edit mode when nothing is set yet (first-time setup); otherwise
 * shows the current method/destination read-only with an Edit affordance.
 */
export function PayoutSettingsForm({
  payoutMethod: initialMethod,
  payoutDestination: initialDestination,
}: {
  payoutMethod: PayoutMethod | null;
  payoutDestination: string | null;
}) {
  const t = useTranslations('teach.studio.payout');
  const router = useRouter();
  const [editing, setEditing] = useState(!initialMethod || !initialDestination);
  const [method, setMethod] = useState<PayoutMethod>(initialMethod ?? 'moncash');
  const [destination, setDestination] = useState(initialDestination ?? '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const hasSaved = Boolean(initialMethod && initialDestination);

  function submit() {
    const dest = destination.trim();
    if (!dest) {
      setMsg({ type: 'err', text: t('errorDestination') });
      return;
    }
    if (dest.length > PAYOUT_DESTINATION_MAX_LENGTH) {
      setMsg({ type: 'err', text: t('errorDestinationTooLong') });
      return;
    }
    start(async () => {
      setMsg(null);
      const res = await updateMyPayoutSettingsAction(method, dest);
      if (res.ok) {
        setMsg({ type: 'ok', text: t('success') });
        setEditing(false);
        router.refresh();
      } else {
        const key = res.message && (KNOWN_ERRORS as readonly string[]).includes(res.message) ? res.message : 'generic';
        setMsg({ type: 'err', text: t(`error.${key}`) });
      }
    });
  }

  function cancel() {
    setMethod(initialMethod ?? 'moncash');
    setDestination(initialDestination ?? '');
    setMsg(null);
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border border-ink/12 bg-paper-light p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconWallet size={16} className="text-ink/50" />
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

      {!editing ? (
        hasSaved ? (
          <p className="mt-2 text-sm text-graphite/80">
            {t('current', { method: t(`methods.${initialMethod}`), destination: initialDestination })}
          </p>
        ) : (
          <p className="mt-2 text-sm text-graphite/70">{t('notSet')}</p>
        )
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="payout-method" className={labelCls}>
              {t('method')}
            </label>
            <select
              id="payout-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PayoutMethod)}
              className={cn(inputCls, focusRing)}
            >
              {PAYOUT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="payout-destination" className={labelCls}>
              {t('destination')}
            </label>
            <input
              id="payout-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t(`hints.${method}`)}
              maxLength={PAYOUT_DESTINATION_MAX_LENGTH}
              className={cn(inputCls, focusRing)}
            />
            <p className="mt-1 text-xs text-graphite/55">{t(`hints.${method}`)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={submit} className={cn(buttonClasses('primary', 'sm'), focusRing)}>
              {pending ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
              {t('save')}
            </button>
            {hasSaved && (
              <button type="button" onClick={cancel} className={cn(buttonClasses('ghost', 'sm'), focusRing)}>
                {t('cancel')}
              </button>
            )}
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
