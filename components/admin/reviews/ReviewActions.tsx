'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconTrash, IconX, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { removeReviewAction } from '@/lib/reviews/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/** Remove-with-reason action for one review row on the admin moderation
 *  queue (Task C3-T6) — mirrors components/admin/teachers/TeacherActions.tsx's
 *  reject/suspend note-modal pattern exactly. */
export function ReviewActions({ reviewId }: { reviewId: string }) {
  const t = useTranslations('admin.reviews.actions');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  function confirmRemove() {
    start(async () => {
      setFeedback(null);
      const res = await removeReviewAction(reviewId, reason);
      if (res.ok) {
        setFeedback({ type: 'ok', text: t('done') });
        setOpen(false);
        setReason('');
        router.refresh();
      } else {
        setFeedback({ type: 'err', text: t('error') });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        className={cn('flex items-center gap-1 rounded border border-stampred/40 px-3.5 py-1.5 text-xs font-semibold text-stampred hover:bg-stampred/10', focusRing)}
      >
        <IconTrash size={13} /> {t('remove')}
      </button>
      {pending && <IconLoader2 size={15} className="animate-spin text-ink/40" />}
      {feedback && (
        <p className={cn('font-mono text-[11px]', feedback.type === 'ok' ? 'text-teal' : 'text-stampred')} role="status">
          {feedback.text}
        </p>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{t('remove')}</h3>
              <button type="button" onClick={() => setOpen(false)} className={cn('text-ink/50 hover:text-ink', focusRing)} aria-label={t('cancel')}>
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-graphite/70">{t('noteHelp')}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('notePlaceholder')}
              className={cn('mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink', focusRing)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!reason.trim() || pending}
                onClick={confirmRemove}
                className={cn(
                  'flex items-center gap-1.5 rounded bg-stampred px-4 py-2.5 text-xs font-semibold text-paper-light disabled:opacity-50',
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
