'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconWorldUpload,
  IconWorldOff,
  IconTrash,
  IconLoader2,
  IconExternalLink,
  IconAlertTriangle,
  IconX,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import {
  publishCourseAction,
  unpublishCourseAction,
  deleteCourseAction,
} from '@/lib/admin/content-actions';
import type { AdminCourseStatus } from '@/lib/courses/write';
import { countMissingReadiness, type ReadinessItem } from '@/lib/courses/readiness';
import { CourseReadiness } from '@/components/content/CourseReadiness';

const statusTone: Record<AdminCourseStatus, string> = {
  draft: 'bg-ink/8 text-ink/60',
  pending_review: 'bg-ochre/15 text-ochre',
  published: 'bg-teal/15 text-teal',
  rejected: 'bg-stampred/15 text-stampred',
  archived: 'bg-ink/8 text-ink/45',
};

export function PublishBar({
  slug,
  code,
  status,
  hasUnpublishedChanges,
  reviewNote,
  canModerate,
  readinessItems,
}: {
  slug: string;
  code: string;
  status: AdminCourseStatus;
  hasUnpublishedChanges: boolean;
  /** Rejection note from the last review pass (Task C3-T3) — shown when `status === 'rejected'`. */
  reviewNote?: string | null;
  /**
   * Task C3 fix: publish/unpublish/delete are moderation acts now
   * (`teachers.review`-gated server-side — see lib/admin/content-actions.ts's
   * `requireModerator`); an `editeur-contenu` (courses.edit only) passes
   * `false` here and sees the status read-only, with no buttons that would
   * just fail server-side anyway.
   */
  canModerate: boolean;
  /** Task K2's checklist — Task A2 folds `CourseReadiness`'s standalone
   *  section into this bar as an expandable disclosure (click the counter)
   *  instead of a separate always-open block above it. A WARNING only:
   *  never disables the Publish button, just labels what's still worth
   *  finishing. */
  readinessItems: ReadinessItem[];
}) {
  const t = useTranslations('admin.cms.publish');
  const tr = useTranslations('admin.cms.readiness');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmUnpub, setConfirmUnpub] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delCode, setDelCode] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const readinessMissing = countMissingReadiness(readinessItems);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; count?: number }>, okText?: string) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (res.ok) {
        setMsg(okText ? { type: 'ok', text: okText } : null);
        setConfirmUnpub(false);
        setConfirmDel(false);
        router.refresh();
      } else {
        const text =
          res.message === 'has_enrollments'
            ? t('hasEnrollments', { count: res.count ?? 0 })
            : res.message === 'code_mismatch'
              ? t('codeMismatch')
              : res.message === 'invalid_status'
                ? t('invalidStatus')
                : t('error');
        setMsg({ type: 'err', text });
      }
    });

  return (
    <section className="sticky bottom-2 z-20 rounded-xl border border-ink/15 bg-paper-light/95 p-4 shadow-[0_-6px_24px_-16px_rgba(16,32,74,0.35)] backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', statusTone[status])}>
          {t(`status.${status}`)}
        </span>
        {hasUnpublishedChanges && (
          <span className="rounded bg-ochre/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ochre">{t('unpublishedChanges')}</span>
        )}

        <button
          type="button"
          onClick={() => setShowChecklist((v) => !v)}
          aria-expanded={showChecklist}
          className={cn(
            'inline-flex items-center gap-1 rounded font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light',
            readinessMissing === 0 ? 'text-teal' : 'text-ochre',
          )}
        >
          {showChecklist ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          {readinessMissing === 0 ? tr('complete') : tr('missingCount', { count: readinessMissing })}
        </button>

        <Link href={`/admin/cours/${slug}/apercu`} className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-ink/60 hover:text-ink">
          <IconExternalLink size={13} /> {t('preview')}
        </Link>
      </div>

      {showChecklist && (
        <div className="mt-3">
          <CourseReadiness items={readinessItems} />
        </div>
      )}

      {status === 'pending_review' && (
        <p className="mt-3 font-mono text-[11px] text-ink/50">{t('inReview')}</p>
      )}

      {status === 'rejected' && (
        <div className="mt-3 rounded-lg border border-stampred/25 bg-stampred/5 p-2.5">
          {reviewNote && (
            <p className="text-xs leading-relaxed text-graphite/80">
              <span className="font-mono text-[10px] uppercase tracking-wide text-stampred">{t('reviewNoteLabel')}</span>
              <br />
              {reviewNote}
            </p>
          )}
          <p className={cn('font-mono text-[11px] text-ink/50', reviewNote && 'mt-2')}>{t('rejectedNote')}</p>
        </div>
      )}

      {/* Task C3 fix: publish/unpublish/delete are teachers.review-gated
          server-side (see lib/admin/content-actions.ts) — an editeur-contenu
          (courses.edit only, `canModerate === false`) sees the status
          read-only, with no buttons that would just fail server-side anyway. */}
      {canModerate && (
        <div className="mt-3 flex flex-wrap gap-2">
          {status === 'draft' && (
            <button type="button" disabled={pending} onClick={() => run(() => publishCourseAction(slug), t('published'))} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
              {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconWorldUpload size={15} />}
              {t('publish')}
            </button>
          )}
          {status === 'published' && (
            <button type="button" disabled={pending} onClick={() => setConfirmUnpub(true)} className={cn('flex items-center gap-1.5 rounded border border-ochre/40 px-4 py-2.5 text-xs font-semibold text-ochre hover:bg-ochre/10')}>
              <IconWorldOff size={15} /> {t('unpublish')}
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 rounded border border-stampred/40 px-4 py-2.5 text-xs font-semibold text-stampred hover:bg-stampred/10">
            <IconTrash size={15} /> {t('delete')}
          </button>
        </div>
      )}

      {msg && <p className={cn('mt-2 font-mono text-[11px]', msg.type === 'ok' ? 'text-teal' : 'text-stampred')}>{msg.text}</p>}

      {/* Unpublish confirm */}
      {confirmUnpub && (
        <Modal title={t('unpublish')} onClose={() => setConfirmUnpub(false)}>
          <p className="flex items-start gap-2 text-sm text-graphite/80">
            <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-ochre" />
            {t('unpublishWarn')}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmUnpub(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('cancel')}</button>
            <button type="button" disabled={pending} onClick={() => run(() => unpublishCourseAction(slug))} className="rounded bg-ochre px-4 py-2.5 text-xs font-semibold text-[#1b1207]">{t('confirmUnpublish')}</button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <Modal title={t('delete')} onClose={() => setConfirmDel(false)}>
          <p className="text-sm text-graphite/80">{t('deleteWarn', { code })}</p>
          <input value={delCode} onChange={(e) => setDelCode(e.target.value)} placeholder={code} className="mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono text-sm text-ink" />
          {msg?.type === 'err' && <p className="mt-2 font-mono text-[11px] text-stampred">{msg.text}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDel(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('cancel')}</button>
            <button type="button" disabled={pending || delCode.trim().toUpperCase() !== code.toUpperCase()} onClick={() => run(() => deleteCourseAction(slug, delCode))} className="rounded bg-stampred px-4 py-2.5 text-xs font-semibold text-paper-light disabled:opacity-40">{t('confirmDelete')}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-ink">{title}</h3>
          <button type="button" onClick={onClose} className="text-ink/50 hover:text-ink"><IconX size={18} /></button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
