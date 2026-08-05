'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconLoader2, IconPencil, IconSend, IconWorldOff, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { fmtUsdCents, fmtDate } from '@/lib/admin/format';
import { submitMyCourseForReviewAction, unpublishMyCourseAction } from '@/lib/teacher/studio-actions';
import type { MyCourseRow } from '@/lib/teacher/studio';

const KNOWN_ERRORS = ['invalid_status', 'not_found', 'forbidden', 'db_required'] as const;

function errorLabel(t: ReturnType<typeof useTranslations>, message?: string): string {
  const key = message && (KNOWN_ERRORS as readonly string[]).includes(message) ? message : 'generic';
  return t(`error.${key}`);
}

const statusTone: Record<MyCourseRow['status'], string> = {
  draft: 'bg-ink/8 text-ink/60',
  pending_review: 'bg-ochre/15 text-ochre',
  published: 'bg-teal/15 text-teal',
  rejected: 'bg-stampred/15 text-stampred',
  archived: 'bg-ink/8 text-ink/45',
};

/**
 * One of the teacher's own courses on the studio dashboard (Task C3-T4).
 * The only mutations available here are SUBMIT (draft/rejected →
 * pending_review) and UNPUBLISH (published → draft) — both call
 * owner-scoped actions from lib/teacher/studio-actions.ts; there is
 * deliberately no "publish" button anywhere in this component, because a
 * teacher can never publish their own course (admin-only, Task C3-T3).
 */
export function CourseCard({ course, locale }: { course: MyCourseRow; locale: string }) {
  const t = useTranslations('teach.studio');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const title = locale === 'ht' ? course.title_ht : course.title_fr || course.title_ht;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setErr(errorLabel(t, res.message));
    });
  }

  return (
    <div className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-[10px] uppercase text-ink/40">{course.code}</span>
          <h3 className="truncate font-display text-lg font-bold leading-tight text-ink">{title || t('untitled')}</h3>
        </div>
        <span className={cn('shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', statusTone[course.status])}>
          {t(`status.${course.status}`)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px] text-ink/60">
        <div>
          <dt className="text-ink/40">{t('col.price')}</dt>
          <dd className="tabular-nums text-ink">{fmtUsdCents(course.priceCents)}</dd>
        </div>
        <div>
          <dt className="text-ink/40">{t('col.sales')}</dt>
          <dd className="tabular-nums text-ink">{course.salesCount}</dd>
        </div>
        <div>
          <dt className="text-ink/40">{t('col.revenue')}</dt>
          <dd className="tabular-nums text-ink">{fmtUsdCents(course.revenueCents)}</dd>
        </div>
      </dl>

      {course.status === 'pending_review' && course.submittedAt && (
        <div className="mt-2 rounded-lg border border-ochre/25 bg-ochre/5 p-2.5">
          <p className="font-mono text-[11px] text-ink/60">{t('submittedAt', { date: fmtDate(course.submittedAt, locale as 'ht' | 'fr') })}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-graphite/75">{t('reviewEta')}</p>
        </div>
      )}
      {course.status === 'rejected' && course.reviewNote && (
        <p className="mt-2 rounded-lg border border-stampred/25 bg-stampred/5 p-2.5 text-xs leading-relaxed text-graphite/80">
          <span className="font-mono text-[10px] uppercase tracking-wide text-stampred">{t('reviewNoteLabel')}</span>
          <br />
          {course.reviewNote}
        </p>
      )}

      {err && (
        <p className="mt-2 flex items-center gap-1 font-mono text-[11px] text-stampred">
          <IconAlertTriangle size={12} /> {err}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/enseigner/studio/cours/${course.slug}/editer`} className={cn(buttonClasses('ghost', 'sm'))}>
          <IconPencil size={13} /> {t('editCta')}
        </Link>

        {(course.status === 'draft' || course.status === 'rejected') && (
          <button
            type="button"
            disabled={pending || course.lessonsCount === 0}
            title={course.lessonsCount === 0 ? t('needLessons') : undefined}
            onClick={() => run(() => submitMyCourseForReviewAction(course.slug))}
            className={cn(buttonClasses('primary', 'sm'))}
          >
            {pending ? <IconLoader2 size={13} className="animate-spin" /> : <IconSend size={13} />}
            {t('submitCta')}
          </button>
        )}

        {course.status === 'published' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unpublishMyCourseAction(course.slug))}
            className="inline-flex items-center gap-1.5 rounded border border-ochre/40 px-3.5 py-1.5 font-mono text-xs font-semibold text-ochre hover:bg-ochre/10 disabled:opacity-40"
          >
            {pending ? <IconLoader2 size={13} className="animate-spin" /> : <IconWorldOff size={13} />}
            {t('unpublishCta')}
          </button>
        )}
      </div>
    </div>
  );
}
