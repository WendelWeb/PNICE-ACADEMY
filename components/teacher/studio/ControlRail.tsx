'use client';

import { useTranslations } from 'next-intl';
import { IconCircleCheck, IconCircleDashed, IconArrowRight } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { useRouter } from '@/i18n/routing';
import type { ReadinessItem, ReadinessKey } from '@/lib/courses/readiness';
import { EDITOR_STEPS, type EditorStepKey, type ReadinessAnchor } from '@/lib/courses/readiness-anchors';
import { STEP_ICONS, STEP_GLYPH } from './steps';
import { jumpToAnchor } from './jump';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * The "bon de contrôle" — the studio editor's PERMANENT checklist rail
 * (Task D1 — le bordereau). Replaces `components/content/EditorTabs.tsx`'s
 * flat pill nav AND the old `StudioStatusBar`'s collapsible
 * `CourseReadiness` disclosure with a single always-visible surface: the 8
 * readiness items (`lib/courses/readiness.ts`), grouped under the 4 numbered
 * steps they belong to (`lib/courses/readiness-anchors.ts`'s
 * `computeReadinessAnchors`), where each step heading AND each unmet item is
 * clickable — a step heading just switches steps (same `?tab=` contract the
 * old tabs used); an unmet item switches step (if needed) AND scrolls/focuses
 * the exact field via `jumpToAnchor` (see that module's doc comment for why
 * it's a retry loop, not a single `getElementById`).
 *
 * Two renderings on two screens (Stage 1 — task-first navigation): an
 * always-open `<aside>` on desktop (`lg:` and up) with the steps' icons +
 * task names, and a native `<details>` on mobile that is now CHECKLIST-ONLY
 * ("Sa ki rete pou fini (N)") — step NAVIGATION on phones moved to the
 * always-visible `MobileStepBar`, because a collapsed disclosure was the
 * only way to find step ② and phone users never opened it.
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
  const missing = items.filter((i) => !i.ok).length;

  const hrefForStep = (step: EditorStepKey) => (step === 'infos' ? basePath : `${basePath}?tab=${step}`);

  function goToStep(step: EditorStepKey) {
    if (step !== activeTab) router.push(hrefForStep(step));
  }

  function goToItem(key: ReadinessKey) {
    const { step, anchorId } = anchors[key];
    if (step !== activeTab) {
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

  const grouped = EDITOR_STEPS.map((step) => ({
    ...step,
    items: items.filter((item) => anchors[item.key].step === step.key),
  }));

  const renderItem = (item: ReadinessItem) =>
    item.ok ? (
      <span className="flex items-center gap-1.5 text-[12px] leading-snug text-graphite/55">
        <IconCircleCheck size={13} className="shrink-0 text-teal" aria-hidden />
        {tr(`items.${item.key}.label`)}
      </span>
    ) : (
      <button
        type="button"
        onClick={() => goToItem(item.key)}
        className={cn('flex w-full items-center gap-1.5 rounded text-left text-[12px] font-medium leading-snug text-ink hover:text-ochre', focusRing)}
      >
        <IconCircleDashed size={13} className="shrink-0 text-ochre" aria-hidden />
        <span className="flex-1 underline decoration-ochre/40 underline-offset-2">{tr(`items.${item.key}.label`)}</span>
        <IconArrowRight size={11} className="shrink-0 text-ochre/70" aria-hidden />
      </button>
    );

  const list = (
    <ol className="space-y-4">
      {grouped.map((group) => {
        const StepIcon = STEP_ICONS[group.key];
        return (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => goToStep(group.key)}
              aria-current={group.key === activeTab ? 'step' : undefined}
              className={cn(
                'flex w-full items-center gap-1.5 rounded font-mono text-[11px] font-semibold uppercase tracking-wide',
                focusRing,
                group.key === activeTab ? 'text-ink' : 'text-ink/55 hover:text-ink',
              )}
            >
              <span aria-hidden className="text-ochre">{STEP_GLYPH[group.number]}</span>
              <StepIcon size={14} className="shrink-0 text-ink/45" aria-hidden />
              <span className="min-w-0 text-left leading-tight">{t(`steps.${group.key}.title`)}</span>
            </button>

            {group.items.length > 0 ? (
              <ul className="mt-1.5 space-y-1.5 border-l border-ink/10 pl-3">
                {group.items.map((item) => (
                  <li key={item.key}>{renderItem(item)}</li>
                ))}
              </ul>
            ) : (
              group.key === 'ressources' && (
                <p className="mt-1 pl-3 font-mono text-[10px] uppercase tracking-wide text-ink/35">{t('optional')}</p>
              )
            )}
          </li>
        );
      })}
    </ol>
  );

  const footer = (
    <p className={cn('mt-4 border-t border-ink/10 pt-3 font-mono text-[11px]', missing === 0 ? 'text-teal' : 'text-ochre')} role="status">
      {missing === 0 ? tr('complete') : tr('missingCount', { count: missing })}
    </p>
  );

  return (
    <>
      {/* Desktop — always open, left column. */}
      <aside aria-label={t('checklist')} className="hidden rounded-xl border border-ink/12 bg-paper-light p-4 lg:block">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('checklist')}</h2>
        <div className="mt-3">{list}</div>
        {footer}
      </aside>

      {/* Mobile/360px — collapsible, no JS required to open (native
          <details>). CHECKLIST-ONLY since Stage 1 (task-first navigation):
          step navigation on phones lives in the always-visible
          `MobileStepBar`; this is just "what's left to finish", flat. */}
      <details className="rounded-xl border border-ink/12 bg-paper-light p-4 lg:hidden">
        <summary className={cn('flex cursor-pointer list-none items-center justify-between gap-2 rounded font-mono text-[11px] uppercase tracking-wide', focusRing)}>
          <span className="text-ink/55">{t('checklistMobile', { count: missing })}</span>
          <span aria-hidden className={missing === 0 ? 'text-teal' : 'text-ochre'}>
            {missing === 0 ? '✓' : missing}
          </span>
        </summary>
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.key}>{renderItem(item)}</li>
          ))}
        </ul>
        {footer}
      </details>
    </>
  );
}
