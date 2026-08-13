'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { IconTrash, IconLoader2, IconAlertTriangle, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/routing';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

type DeleteResult = { ok: boolean; message?: string; count?: number };

/**
 * Stage 1 fix (regression) — the studio's "zone danger": permanently delete
 * a course you own, restoring the capability the old admin CMS's
 * `PublishBar` used to provide (see lib/teacher/studio-actions.ts's
 * `deleteMyCourseAction`, which this calls — same enrollment-count +
 * type-the-code guard `writeOps.deleteCourse` has always enforced, now
 * reached through the ownership gate instead of an admin role check).
 * Rendered only on the "infos" step, below `CourseEditor` — deliberately
 * NOT sticky/prominent like the publish/submit action, since this is a
 * rare, destructive, deliberately-sought-out action.
 */
export function DeleteCourseControl({
  slug,
  code,
  deleteAction,
}: {
  slug: string;
  code: string;
  deleteAction: (slug: string, confirmCode: string) => Promise<DeleteResult>;
}) {
  const t = useTranslations('teach.studio.delete');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setErr(null);
      const res = await deleteAction(slug, value);
      if (res.ok) {
        router.push('/enseigner/studio');
        return;
      }
      setErr(
        res.message === 'has_enrollments'
          ? t('hasEnrollments', { count: res.count ?? 0 })
          : res.message === 'code_mismatch'
            ? t('codeMismatch')
            : t('error'),
      );
    });

  return (
    <section className="rounded-xl border border-stampred/25 bg-stampred/[0.03] p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wide text-stampred">{t('title')}</h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('explain')}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'mt-3 flex items-center gap-1.5 rounded border border-stampred/40 px-3.5 py-2 font-mono text-[11px] font-semibold text-stampred hover:bg-stampred/10',
          focusRing,
        )}
      >
        <IconTrash size={14} /> {t('cta')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{t('cta')}</h3>
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
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-stampred" />
              {t('warn', { code })}
            </p>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={code}
              aria-label={code}
              className={cn(
                'mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono text-sm text-ink',
                focusRing,
              )}
            />
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
                disabled={pending || value.trim().toUpperCase() !== code.toUpperCase()}
                onClick={run}
                className={cn(
                  'flex items-center gap-1.5 rounded bg-stampred px-4 py-2.5 text-xs font-semibold text-paper-light disabled:opacity-40',
                  focusRing,
                )}
              >
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : null}
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
