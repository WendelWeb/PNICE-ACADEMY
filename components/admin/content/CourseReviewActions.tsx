'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCheck, IconX, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { approveCourseAction, rejectCourseAction, type ReviewResult } from '@/lib/courses/review-actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/** Approve / reject(-with-note) for one course in the `/admin/cours` "À valider" queue. */
export function CourseReviewActions({ slug }: { slug: string }) {
  const t = useTranslations('admin.cms.review');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');

  const run = (fn: () => Promise<ReviewResult>) =>
    start(async () => {
      setFeedback(null);
      const res = await fn();
      if (res.ok) {
        setFeedback('ok');
        setRejectOpen(false);
        setNote('');
        router.refresh();
      } else {
        setFeedback('err');
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approveCourseAction(slug))}
          className={cn(buttonClasses('dark', 'sm'), 'gap-1')}
        >
          <IconCheck size={13} /> {t('approve')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setRejectOpen(true)}
          className={cn('flex items-center gap-1 rounded border border-stampred/40 px-3.5 py-1.5 text-xs font-semibold text-stampred hover:bg-stampred/10', focusRing)}
        >
          <IconX size={13} /> {t('reject')}
        </button>
        {pending && <IconLoader2 size={15} className="animate-spin text-ink/40" />}
      </div>
      {feedback && (
        <p className={cn('font-mono text-[11px]', feedback === 'ok' ? 'text-teal' : 'text-stampred')} role="status">
          {feedback === 'ok' ? t('done') : t('error')}
        </p>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{t('reject')}</h3>
              <button type="button" onClick={() => setRejectOpen(false)} className={cn('text-ink/50 hover:text-ink', focusRing)} aria-label={t('cancel')}>
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-graphite/70">{t('noteHelp')}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t('notePlaceholder')}
              className={cn('mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink', focusRing)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectOpen(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!note.trim() || pending}
                onClick={() => run(() => rejectCourseAction(slug, note))}
                className={cn('flex items-center gap-1.5 rounded bg-stampred px-4 py-2.5 text-xs font-semibold text-paper-light disabled:opacity-50', focusRing)}
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
