'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconLoader2, IconSend, IconWorldOff, IconAlertTriangle, IconExternalLink } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { submitMyCourseForReviewAction, unpublishMyCourseAction } from '@/lib/teacher/studio-actions';
import type { DbCourseStatus } from '@/lib/courses/write';

const statusTone: Record<DbCourseStatus, string> = {
  draft: 'bg-ink/8 text-ink/60',
  pending_review: 'bg-ochre/15 text-ochre',
  published: 'bg-teal/15 text-teal',
  rejected: 'bg-stampred/15 text-stampred',
  archived: 'bg-ink/8 text-ink/45',
};

const KNOWN_ERRORS = ['invalid_status', 'not_found', 'forbidden', 'db_required'] as const;

/**
 * The teacher studio's course-editor status bar (Task C3-T4) — the studio's
 * equivalent of `components/admin/content/PublishBar.tsx`, deliberately
 * NARROWER: a teacher may only SUBMIT (draft/rejected → pending_review) or
 * UNPUBLISH (published → draft) their own course. There is NO publish
 * button and NO delete button here — publishing a course is admin-only
 * (Task C3-T3, `/admin/cours`), and course deletion is out of the teacher
 * studio's scope entirely.
 */
export function StudioStatusBar({
  slug,
  status,
  reviewNote,
}: {
  slug: string;
  status: DbCourseStatus;
  reviewNote: string | null;
}) {
  const t = useTranslations('teach.studio');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else {
        const key = res.message && (KNOWN_ERRORS as readonly string[]).includes(res.message) ? res.message : 'generic';
        setErr(t(`error.${key}`));
      }
    });
  }

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', statusTone[status])}>
          {t(`status.${status}`)}
        </span>

        {status === 'published' && (
          <Link href={`/formations/${slug}`} className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-ink/60 hover:text-ink">
            <IconExternalLink size={13} /> {t('viewPublic')}
          </Link>
        )}
      </div>

      {status === 'rejected' && reviewNote && (
        <p className="mt-3 rounded-lg border border-stampred/25 bg-stampred/5 p-2.5 text-xs leading-relaxed text-graphite/80">
          <span className="font-mono text-[10px] uppercase tracking-wide text-stampred">{t('reviewNoteLabel')}</span>
          <br />
          {reviewNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(status === 'draft' || status === 'rejected') && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => submitMyCourseForReviewAction(slug))}
            className={cn(buttonClasses('primary', 'md'), 'text-xs')}
          >
            {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconSend size={15} />}
            {t('submitCta')}
          </button>
        )}
        {status === 'published' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unpublishMyCourseAction(slug))}
            className="flex items-center gap-1.5 rounded border border-ochre/40 px-4 py-2.5 text-xs font-semibold text-ochre hover:bg-ochre/10 disabled:opacity-40"
          >
            {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconWorldOff size={15} />}
            {t('unpublishCta')}
          </button>
        )}
        {status === 'pending_review' && <p className="font-mono text-[11px] text-ink/50">{t('pendingReviewNote')}</p>}
      </div>

      {err && (
        <p className="mt-2 flex items-center gap-1 font-mono text-[11px] text-stampred">
          <IconAlertTriangle size={12} /> {err}
        </p>
      )}
    </section>
  );
}
