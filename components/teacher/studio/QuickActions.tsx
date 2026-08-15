'use client';

import { useTranslations } from 'next-intl';
import { IconVideo, IconPhoto, IconFileText } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { useRouter } from '@/i18n/routing';
import type { EditorStepKey } from '@/lib/courses/readiness-anchors';
import { hasActiveUploads } from '@/components/content/uploadActivity';
import { jumpToAnchor } from './jump';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * "Ki sa w vle fè ?" — the editor's task-first shortcut strip (Stage 1).
 * The friction audit's core finding: a teacher lands on step ① (15 text
 * fields, zero mention of video) and never discovers where the video goes.
 * This strip sits at the top of the content column on EVERY step and jumps
 * straight to the three things a teacher most often comes here to do:
 * put up a video, change the course photo, hand students a document.
 *
 * Navigation reuses the exact bordereau mechanics (`ControlRail.goToItem`'s
 * contract): cross-step → `router.push` with the frozen `?tab=` URL + hash;
 * same-step → `replaceState` + the `studio:jump-lesson` CustomEvent (so
 * `PlanEditor` expands the right lesson row); either way `jumpToAnchor`
 * polls until the real field exists, then scrolls + focuses it.
 *
 * `videoAnchor`/`resourcesAnchor` are computed SERVER-SIDE by the page
 * (first lesson without a video / first lesson, falling back to
 * `plan-add-lesson` on a lesson-less course) — this component never needs
 * the lessons themselves.
 */
export function QuickActions({
  basePath,
  activeTab,
  videoAnchor,
  resourcesAnchor,
}: {
  basePath: string;
  activeTab: EditorStepKey;
  /** `lesson-<id>-video` for the first video-less lesson (else first lesson),
   *  or `plan-add-lesson` when the course has no lessons yet. */
  videoAnchor: string;
  /** `lesson-<id>-resources` for the first lesson, or `plan-add-lesson`. */
  resourcesAnchor: string;
}) {
  const t = useTranslations('teach.studio.editor.quick');
  const tEditor = useTranslations('teach.studio.editor');
  const router = useRouter();

  function go(step: EditorStepKey, anchorId: string) {
    if (step !== activeTab) {
      // Review fix: switching steps swaps the plan out of the tree and kills
      // any in-flight video upload — confirm before navigating.
      if (hasActiveUploads() && !window.confirm(tEditor('uploadLeaveConfirm'))) return;
      // Explicit `?tab=` always — see ControlRail's hrefForStep note.
      const base = `${basePath}?tab=${step}`;
      router.push(`${base}#${anchorId}`);
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

  const actions = [
    { key: 'video' as const, icon: IconVideo, onClick: () => go('plan', videoAnchor) },
    { key: 'photo' as const, icon: IconPhoto, onClick: () => go('medias', 'field-main-image') },
    { key: 'doc' as const, icon: IconFileText, onClick: () => go('plan', resourcesAnchor) },
  ];

  return (
    <div className="rounded-xl border border-ink/12 bg-paper-light px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink/50">{t('title')}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {actions.map(({ key, icon: Icon, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-ink/15 bg-paper px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:border-ochre/50 hover:bg-ochre/5 motion-reduce:transition-none',
              focusRing,
            )}
          >
            <Icon size={16} className="shrink-0 text-ochre" aria-hidden />
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}
