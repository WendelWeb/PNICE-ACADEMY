'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconGift,
  IconBan,
  IconUserOff,
  IconUserCheck,
  IconReceiptRefund,
  IconMail,
  IconLogin2,
  IconPlus,
  IconLoader2,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import {
  grantCourseAction,
  revokeCourseAction,
  grantSubscriptionAction,
  setStatusAction,
  refundPaymentAction,
  resendVerificationAction,
  impersonateAction,
  type ActionResult,
} from '@/lib/admin/actions';
import type { UserStatus } from '@/lib/admin/data';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

type Feedback = { type: 'ok' | 'err'; text: string } | null;

function useRunner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const run = (fn: () => Promise<ActionResult>, okText: string, errText: string) =>
    start(async () => {
      setFeedback(null);
      const res = await fn();
      if (res.ok) {
        setFeedback({ type: 'ok', text: okText });
        router.refresh(); // re-render the server fiche without a full reload
      } else {
        setFeedback({ type: 'err', text: errText });
      }
    });
  return { pending, feedback, setFeedback, run };
}

function Feedback({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      className={cn(
        'mt-2 font-mono text-[11px]',
        feedback.type === 'ok' ? 'text-teal' : 'text-stampred',
      )}
      role="status"
    >
      {feedback.text}
    </p>
  );
}

/* ----------------------------- account actions --------------------------- */
export function AccountActions({
  userId,
  status,
  isSubscriber,
  catalog,
}: {
  userId: string;
  status: UserStatus;
  isSubscriber: boolean;
  catalog: { slug: string; title: string }[];
}) {
  const t = useTranslations('admin.users.actions');
  const { pending, feedback, run } = useRunner();
  const [grantOpen, setGrantOpen] = useState(false);
  const [slug, setSlug] = useState(catalog[0]?.slug ?? '');
  const [reasonFor, setReasonFor] = useState<'suspend' | 'ban' | null>(null);
  const [reason, setReason] = useState('');

  const submitStatus = (next: UserStatus) => {
    run(() => setStatusAction(userId, next, reason), t('done'), t('error'));
    setReasonFor(null);
    setReason('');
  };

  return (
    <div className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')}</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setGrantOpen((v) => !v)}
          className={cn(buttonClasses('dark', 'md'), 'text-xs')}
        >
          <IconPlus size={15} /> {t('grantCourse')}
        </button>

        {!isSubscriber && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => grantSubscriptionAction(userId), t('done'), t('error'))}
            className={cn(buttonClasses('dark', 'md'), 'text-xs')}
          >
            <IconGift size={15} /> {t('grantSub')}
          </button>
        )}

        {status === 'active' ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => setReasonFor('suspend')}
              className={cn('flex items-center gap-1.5 rounded border border-ochre/40 px-4 py-2.5 text-xs font-semibold text-ochre hover:bg-ochre/10', focusRing)}
            >
              <IconUserOff size={15} /> {t('suspend')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setReasonFor('ban')}
              className={cn('flex items-center gap-1.5 rounded border border-stampred/40 px-4 py-2.5 text-xs font-semibold text-stampred hover:bg-stampred/10', focusRing)}
            >
              <IconBan size={15} /> {t('ban')}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => submitStatus('active')}
            className={cn('flex items-center gap-1.5 rounded border border-teal/40 px-4 py-2.5 text-xs font-semibold text-teal hover:bg-teal/10', focusRing)}
          >
            <IconUserCheck size={15} /> {t('reactivate')}
          </button>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resendVerificationAction(userId), t('verifSent'), t('error'))}
          className={cn(buttonClasses('ghost', 'md'), 'text-xs')}
        >
          <IconMail size={15} /> {t('resendVerif')}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => impersonateAction(userId), t('impersonateMock'), t('error'))}
          className={cn(buttonClasses('ghost', 'md'), 'text-xs')}
        >
          <IconLogin2 size={15} /> {t('impersonate')}
        </button>

        {pending && <IconLoader2 size={18} className="animate-spin self-center text-ink/40" />}
      </div>

      {/* Grant course inline panel */}
      {grantOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 bg-paper p-3">
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={cn('rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink', focusRing)}
          >
            {catalog.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !slug}
            onClick={() => {
              run(() => grantCourseAction(userId, slug), t('done'), t('error'));
              setGrantOpen(false);
            }}
            className={cn(buttonClasses('primary', 'md'), 'text-xs')}
          >
            {t('confirmGrant')}
          </button>
        </div>
      )}

      {/* Reason modal for suspend / ban */}
      {reasonFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">
                {reasonFor === 'ban' ? t('ban') : t('suspend')}
              </h3>
              <button
                type="button"
                onClick={() => setReasonFor(null)}
                className={cn('text-ink/50 hover:text-ink', focusRing)}
                aria-label={t('cancel')}
              >
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-graphite/70">{t('reasonHelp')}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('reasonPlaceholder')}
              className={cn('mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink', focusRing)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReasonFor(null)}
                className={cn(buttonClasses('ghost', 'md'), 'text-xs')}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!reason.trim() || pending}
                onClick={() => submitStatus(reasonFor === 'ban' ? 'banned' : 'suspended')}
                className={cn(
                  'flex items-center gap-1.5 rounded px-4 py-2.5 text-xs font-semibold text-paper-light',
                  reasonFor === 'ban' ? 'bg-stampred' : 'bg-ochre',
                  'disabled:opacity-50',
                  focusRing,
                )}
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Feedback feedback={feedback} />
    </div>
  );
}

/* ----------------------------- inline buttons ---------------------------- */
export function RefundButton({ userId, paymentId }: { userId: string; paymentId: string }) {
  const t = useTranslations('admin.users.actions');
  const { pending, run } = useRunner();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => refundPaymentAction(userId, paymentId), t('done'), t('error'))}
      className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-stampred hover:underline', focusRing)}
    >
      <IconReceiptRefund size={13} /> {t('refund')}
    </button>
  );
}

export function RevokeCourseButton({ userId, courseSlug }: { userId: string; courseSlug: string }) {
  const t = useTranslations('admin.users.actions');
  const { pending, run } = useRunner();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => revokeCourseAction(userId, courseSlug), t('done'), t('error'))}
      className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-stampred hover:underline', focusRing)}
    >
      <IconX size={12} /> {t('revoke')}
    </button>
  );
}
