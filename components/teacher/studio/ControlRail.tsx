'use client';

import { useTranslations } from 'next-intl';
import { IconCircleCheck, IconArrowRight, IconChevronDown } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { useRouter } from '@/i18n/routing';
import type { ReadinessItem, ReadinessKey } from '@/lib/courses/readiness';
import { EDITOR_STEPS, type EditorStepKey, type ReadinessAnchor } from '@/lib/courses/readiness-anchors';
import { hasActiveUploads } from '@/components/content/uploadActivity';
import { STEP_GLYPH } from './steps';
import { jumpToAnchor } from './jump';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * The "bon de contrôle" — now a PROGRESS PANEL, not a wall (owner: « UI/UX
 * de cette partie pue » while looking at all 8 items rendered at equal
 * volume, done and to-do alike, under step headings that duplicated the
 * tab bar).
 *
 * The masterclass rule applied: show WHAT'S LEFT, shelve what's done.
 *   - header: name + « 7/8 » fraction + a thin progress bar — the state of
 *     the whole course in one glance;
 *   - then ONLY the unmet items, as tappable ochre action rows (step glyph
 *     + short label + arrow) — each one jumps straight to its exact field
 *     via the same goToItem contract as before (`?tab=` push + anchor +
 *     `jumpToAnchor` retry loop, uploads guarded);
 *   - the met items collapse into one native `<details>` line
 *     (« N bagay regle ✓ ») for the teacher who wants to double-check;
 *   - all done ⇒ one teal line, nothing else.
 *
 * Step NAVIGATION lives in the always-visible step tab bar (MobileStepBar,
 * all sizes since the « pa gen pati kontni » fix) — the rail no longer
 * duplicates it.
 */
export function ControlRail({
  items,
  anchors,
  activeTab,
  basePath,
}: {
  items: ReadinessItem[];
  anchors: Record<ReadinessKey, ReadinessAnchor>;
  activeTab: EditorStepKey;
  basePath: string;
}) {
  const t = useTranslations('teach.studio.editor');
  const tr = useTranslations('admin.cms.readiness');
  const router = useRouter();
  const done = items.filter((i) => i.ok);
  const todo = items.filter((i) => !i.ok);
  const missing = todo.length;
  const pct = items.length === 0 ? 100 : Math.round((done.length / items.length) * 100);

  // ALWAYS explicit `?tab=` — the BARE path is the smart landing (the page
  // picks the step where work remains), so an explicit jump must always
  // pin its step.
  const hrefForStep = (step: EditorStepKey) => `${basePath}?tab=${step}`;

  /** Review fix: a `?tab=` push swaps the active step's content out of the
   *  tree — killing any in-flight video upload with it. Never silently. */
  function confirmLeaveUploads(): boolean {
    return !hasActiveUploads() || window.confirm(t('uploadLeaveConfirm'));
  }

  function goToItem(key: ReadinessKey) {
    const { step, anchorId } = anchors[key];
    if (step !== activeTab) {
      if (!confirmLeaveUploads()) return;
      router.push(`${hrefForStep(step)}#${anchorId}`);
    } else {
      try {
        window.history.replaceState(null, '', `#${anchorId}`);
      } catch {
        /* non-browser / restricted environment — the jump still works without it */
      }
      window.dispatchEvent(new CustomEvent('studio:jump-lesson', { detail: { anchorId } }));
    }
    jumpToAnchor(anchorId);
  }

  const stepGlyphFor = (key: ReadinessKey) => {
    const step = anchors[key].step;
    const number = EDITOR_STEPS.find((s) => s.key === step)?.number ?? 1;
    return STEP_GLYPH[number];
  };

  const body = (
    <>
      {/* One-glance state: fraction + bar. */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('checklist')}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', missing === 0 ? 'bg-teal' : 'bg-ochre')}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* ONLY what's left — each row is a door to its exact field. */}
      {todo.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {todo.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => goToItem(item.key)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border border-ochre/30 bg-ochre/[0.07] px-2.5 py-2 text-left text-[12px] font-medium leading-snug text-ink transition-colors hover:border-ochre hover:bg-ochre/[0.12]',
                  focusRing,
                )}
              >
                <span aria-hidden className="shrink-0 font-mono text-[10px] text-ochre">
                  {stepGlyphFor(item.key)}
                </span>
                <span className="flex-1">{tr(`items.${item.key}.label`)}</span>
                <IconArrowRight size={12} className="shrink-0 text-ochre" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {missing === 0 && (
        <p className="mt-3 font-mono text-[11px] text-teal" role="status">
          {tr('complete')}
        </p>
      )}

      {/* The done pile, shelved but checkable. */}
      {done.length > 0 && (
        <details className="mt-3">
          <summary
            className={cn(
              'flex cursor-pointer list-none items-center gap-1.5 rounded font-mono text-[11px] text-graphite/55 transition-colors hover:text-ink',
              focusRing,
            )}
          >
            <IconCircleCheck size={13} className="shrink-0 text-teal" aria-hidden />
            {tr('doneCount', { count: done.length })}
            <IconChevronDown size={12} className="shrink-0 text-ink/35" aria-hidden />
          </summary>
          <ul className="mt-2 space-y-1 border-l border-teal/20 pl-3">
            {done.map((item) => (
              <li key={item.key} className="flex items-center gap-1.5 text-[12px] leading-snug text-graphite/55">
                <IconCircleCheck size={12} className="shrink-0 text-teal" aria-hidden />
                {tr(`items.${item.key}.label`)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );

  return (
    <>
      {/* Desktop — always open, left column. */}
      <aside aria-label={t('checklist')} className="hidden rounded-xl border border-ink/12 bg-paper-light p-4 lg:block">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('checklist')}</h2>
          <span className={cn('font-mono text-[12px] font-semibold', missing === 0 ? 'text-teal' : 'text-ink/70')}>
            {done.length}/{items.length}
          </span>
        </div>
        {body}
      </aside>

      {/* Mobile/360px — collapsible, no JS required to open (native
          <details>): just "what's left", the tab bar handles navigation. */}
      <details className="rounded-xl border border-ink/12 bg-paper-light p-4 lg:hidden">
        <summary className={cn('flex cursor-pointer list-none items-center justify-between gap-2 rounded font-mono text-[11px] uppercase tracking-wide', focusRing)}>
          <span className="text-ink/55">{t('checklistMobile', { count: missing })}</span>
          <span aria-hidden className={missing === 0 ? 'text-teal' : 'text-ochre'}>
            {missing === 0 ? '✓' : missing}
          </span>
        </summary>
        {body}
      </details>
    </>
  );
}
