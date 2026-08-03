'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconArrowLeft,
  IconSend,
  IconWorldOff,
  IconAlertTriangle,
  IconExternalLink,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { Link, useRouter } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { Stamp } from '@/components/ui/Stamp';
import { Sceau } from '@/components/ui/Sceau';
import type { DbCourseStatus } from '@/lib/courses/write';
import { prefersReducedMotion } from './jump';

const statusTone: Record<DbCourseStatus, string> = {
  draft: 'bg-ink/8 text-ink/60',
  pending_review: 'bg-ochre/15 text-ochre',
  published: 'bg-teal/15 text-teal',
  rejected: 'bg-stampred/15 text-stampred',
  archived: 'bg-ink/8 text-ink/45',
};

const KNOWN_ERRORS = ['invalid_status', 'not_found', 'forbidden', 'db_required'] as const;

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper';

/** The stamp's CSS transition is 0.45s (see globals.css's `.stamp`) — the
 *  seal button waits slightly less than that before firing the actual
 *  submit, so the click feels immediate but the visual "press" still reads
 *  as landing first. */
const SEAL_DELAY_MS = 380;

/**
 * The bordereau's sticky header (Task D1 — le bordereau): course code +
 * title + status badge + the ONE primary action, absorbing what used to be
 * split across the page's own `<h1>` block and `StudioStatusBar` (both
 * retired by this component). Two rows on narrow screens (identity, then
 * action), one row from `sm:` up — see the mock in the D1 plan.
 *
 * The primary action has two faces (Task D1 #4 — "the signature"): while
 * `missing > 0` it's a plain ochre pill showing the remaining count; once
 * every readiness item is green it becomes the wax-seal button (reusing
 * `Stamp`/`Sceau`) that plays the stamp-down animation on click BEFORE the
 * actual `submitAction` fires (`SEAL_DELAY_MS`, skipped entirely under
 * reduced motion — the action fires immediately and the seal shows its
 * settled state, same contract as every other `.stamp` on the site).
 *
 * Still exactly what `StudioStatusBar` enforced: a teacher can only SUBMIT
 * (draft/rejected → pending_review) or UNPUBLISH (published → draft) their
 * own course — publishing itself stays admin-only, untouched by this task.
 */
export function BordereauHeader({
  slug,
  code,
  title,
  status,
  reviewNote,
  missing,
  submitAction,
  unpublishAction,
  children,
}: {
  slug: string;
  code: string;
  title: string;
  status: DbCourseStatus;
  reviewNote: string | null;
  /** `countMissingReadiness` on the same items the rail shows — drives the
   *  plain-pill-vs-seal switch below. */
  missing: number;
  submitAction: (slug: string) => Promise<{ ok: boolean; message?: string }>;
  unpublishAction: (slug: string) => Promise<{ ok: boolean; message?: string }>;
  /** Rendered INSIDE the sticky header, below the identity/action rows —
   *  the editor page slots `MobileStepBar` here (review fix) so the phone
   *  step navigation actually stays on screen while the plan scrolls,
   *  instead of scrolling away in normal flow. Optional/additive. */
  children?: React.ReactNode;
}) {
  const t = useTranslations('teach.studio');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.ok) {
        router.refresh();
      } else {
        setArmed(false);
        const key = res.message && (KNOWN_ERRORS as readonly string[]).includes(res.message) ? res.message : 'generic';
        setErr(t(`error.${key}`));
      }
    });
  }

  function onSubmitClick() {
    if (pending) return;
    if (missing === 0) {
      setArmed(true);
      if (prefersReducedMotion()) run(() => submitAction(slug));
      else window.setTimeout(() => run(() => submitAction(slug)), SEAL_DELAY_MS);
    } else {
      run(() => submitAction(slug));
    }
  }

  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-ink/12 bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link href="/enseigner/studio" className={cn('inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink', focusRing)}>
            <IconArrowLeft size={14} />
            <span className="hidden sm:inline">{t('backToStudio')}</span>
          </Link>
          <span className="shrink-0 font-mono text-[11px] uppercase text-ink/40">{code}</span>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink">{title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', statusTone[status])}>
            {t(`status.${status}`)}
          </span>

          {status === 'published' && (
            <Link href={`/formations/${slug}`} className={cn('inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink/60 hover:text-ink', focusRing)}>
              <IconExternalLink size={13} /> <span className="hidden sm:inline">{t('viewPublic')}</span>
            </Link>
          )}

          {(status === 'draft' || status === 'rejected') &&
            (missing === 0 ? (
              <SubmitSeal armed={armed} pending={pending} onClick={onSubmitClick} label={t('submitCta')} />
            ) : (
              <button type="button" disabled={pending} onClick={onSubmitClick} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
                {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconSend size={15} />}
                {t('submitCta')}
                <span className="rounded-full bg-[#1b1207]/15 px-1.5 py-0.5 font-mono text-[10px] leading-none">{missing}</span>
              </button>
            ))}

          {status === 'published' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => unpublishAction(slug))}
              className={cn(
                'flex items-center gap-1.5 rounded border border-ochre/40 px-4 py-2.5 text-xs font-semibold text-ochre hover:bg-ochre/10 disabled:opacity-40',
                focusRing,
              )}
            >
              {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconWorldOff size={15} />}
              {t('unpublishCta')}
            </button>
          )}

          {status === 'pending_review' && <p className="font-mono text-[11px] text-ink/50">{t('pendingReviewNote')}</p>}
        </div>
      </div>

      {status === 'rejected' && reviewNote && (
        <p className="mt-2 rounded-lg border border-stampred/25 bg-stampred/5 p-2.5 text-xs leading-relaxed text-graphite/80">
          <span className="font-mono text-[10px] uppercase tracking-wide text-stampred">{t('reviewNoteLabel')}</span>
          <br />
          {reviewNote}
        </p>
      )}

      {err && (
        <p className="mt-2 flex items-center gap-1 font-mono text-[11px] text-stampred" role="alert">
          <IconAlertTriangle size={12} /> {err}
        </p>
      )}

      {children}
    </header>
  );
}

/** The publication seal (Task D1 #4) — a real, keyboard-operable `<button>`
 *  whose visual IS the wax seal; `armed` is owned by the parent (flips true
 *  on click, back to false if the submit call ends up failing) and handed
 *  straight to `Stamp`'s controlled `stamped` prop. */
function SubmitSeal({
  armed,
  pending,
  onClick,
  label,
}: {
  armed: boolean;
  pending: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={label}
      className={cn('inline-flex items-center gap-2 rounded-full disabled:opacity-60', focusRing)}
    >
      <Stamp stamped={armed} rotate={-6}>
        <Sceau size="xs" tone="ochre" rotate={-6}>
          {pending ? <IconLoader2 size={16} className="animate-spin" /> : <IconCheck size={18} stroke={2.5} />}
        </Sceau>
      </Stamp>
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ochre">{label}</span>
    </button>
  );
}
