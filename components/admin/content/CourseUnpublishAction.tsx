'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconWorldOff, IconLoader2, IconAlertTriangle, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { unpublishCourseAction } from '@/lib/admin/content-actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * Stage 1 fix — the platform's real MODERATION takedown power: pull ANY
 * teacher's currently-published course from the public catalog (policy
 * violation, complaint, etc.), independent of that teacher's own studio
 * unpublish. `unpublishCourseAction` (lib/admin/content-actions.ts) already
 * existed but had no reachable UI — this is that UI, on the `/admin/cours`
 * oversight list's "all" tab, shown only for a moderator (`teachers.review`,
 * same gate the review queue uses) and only on a `published` row.
 */
export function CourseUnpublishAction({ slug }: { slug: string }) {
  const t = useTranslations('admin.cms.publish');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setErr(null);
      const res = await unpublishCourseAction(slug);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setErr(t('error'));
      }
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-ochre hover:underline', focusRing)}
      >
        <IconWorldOff size={12} /> {t('unpublish')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{t('unpublish')}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('cancel')}
                className={cn('text-ink/50 hover:text-ink', focusRing)}
              >
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-2 flex items-start gap-2 text-sm text-graphite/80">
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-ochre" />
              {t('unpublishWarn')}
            </p>
            {err && (
              <p className="mt-2 font-mono text-[11px] text-stampred" role="alert">
                {err}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={run}
                className={cn(
                  'flex items-center gap-1.5 rounded bg-ochre px-4 py-2.5 text-xs font-semibold text-[#1b1207] disabled:opacity-40',
                  focusRing,
                )}
              >
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : null}
                {t('confirmUnpublish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
