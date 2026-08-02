'use client';

import { useLocale, useTranslations } from 'next-intl';
import { IconChevronUp, IconChevronDown, IconChevronRight, IconVideo, IconPaperclip } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { AdminLesson, AdminChapter } from '@/lib/courses/write';
import { jumpToAnchor } from '@/components/teacher/studio/jump';
import { focusRing, iconBtn, secToMmss } from './shared';
import { LessonEditPanel } from './LessonEditPanel';
import type { LessonActions } from './types';

/**
 * A single lesson in the plan editor (Task A2 #3/#4 — split out of the old
 * 539-line `LessonsManager.tsx`). COLLAPSED BY DEFAULT: shows only the
 * summary line the task calls for (index · title · duration · video chip ·
 * preview chip · up/down · expand toggle) — editing fields only mount when
 * this row is the one open lesson in the plan-wide accordion (`expandedId`
 * lifted to `PlanEditor`, threaded down through `ChapterGroup`).
 */
export function LessonRow({
  slug,
  lesson,
  index,
  total,
  isDraft,
  onAct,
  actions,
  chapters,
  bilingual,
  primaryLocale,
  expandedId,
  onToggleExpand,
}: {
  slug: string;
  lesson: AdminLesson;
  index: number;
  total: number;
  isDraft: boolean;
  onAct: (fn: () => Promise<{ ok: boolean }>) => void;
  actions: LessonActions;
  chapters: AdminChapter[];
  /** The parent course's optional-translation setting (Task: lesson-language)
   *  — plain data props threaded down to `LessonEditPanel`, see its doc
   *  comment. Does NOT change the `actions` DI contract. */
  bilingual: boolean;
  primaryLocale: 'ht' | 'fr';
  expandedId: string | null;
  onToggleExpand: (lessonId: string) => void;
}) {
  const t = useTranslations('admin.cms.lessons');
  const locale = useLocale();
  const expanded = expandedId === lesson.id;
  const noVideo = !lesson.bunnyVideoId;
  const docsCount = lesson.resources.length;

  const displayTitle =
    (locale === 'ht' ? lesson.title_ht : lesson.title_fr) || lesson.title_ht || lesson.title_fr || t('untitledLesson');

  /** "Mete videyo a" (Stage 1 — task-first navigation): the old passive
   *  "Pa gen videyo" chip stated a problem with no way to act on it. This
   *  expands the row (the panel's fields mount on the next render) and lets
   *  `jumpToAnchor`'s retry loop land on the `lesson-<id>-video` section the
   *  instant it exists. */
  function onAddVideo() {
    if (!expanded) onToggleExpand(lesson.id);
    jumpToAnchor(`lesson-${lesson.id}-video`);
  }

  return (
    // `id` is the studio bon-de-contrôle rail's jump target for this
    // lesson's readiness gaps (missing video/title, no preview lesson yet —
    // Task D1); `PlanEditor`'s hash/`studio:jump-lesson` listener expands
    // this row first so the jump lands on the real field, not just the row.
    // The lesson CARD (Task D2 #5): lighter `bg-paper-light` + a soft shadow
    // — deliberately lighter than `ChapterGroup`'s solid kraft-toned
    // `bg-paper` band, so a lesson reads as a card sitting inside its
    // chapter rather than another slab of the same material.
    <li id={`lesson-${lesson.id}`} className={cn('rounded-lg border bg-paper-light shadow-sm', noVideo && !isDraft ? 'border-stampred/40' : 'border-ink/10')}>
      <div
        className={cn(
          'flex items-center gap-2 p-2.5 transition-colors hover:bg-ink/[0.03] motion-reduce:transition-none',
          expanded ? 'rounded-t-lg' : 'rounded-lg',
        )}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/[0.06] font-mono text-[10px] text-ink/50">{index + 1}</span>

        <button
          type="button"
          onClick={() => onToggleExpand(lesson.id)}
          aria-expanded={expanded}
          className={cn('flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left', focusRing)}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{displayTitle}</span>

          <span className="shrink-0 font-mono text-[10px] text-ink/45 tabular-nums">{secToMmss(lesson.durationSeconds)}</span>

          {docsCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-ink/50">
              <IconPaperclip size={10} aria-hidden />
              {t('docsChip', { count: docsCount })}
            </span>
          )}

          {lesson.isPreview && (
            <span className="shrink-0 rounded bg-ochre/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ochre">
              {t('preview')}
            </span>
          )}
        </button>

        {/* Video status — a REAL action when the video is missing (Stage 1):
            a bordered button that opens the row on its video section, not a
            passive chip naming the gap. Sibling of the title button (never
            nested — nested interactive elements are invalid). */}
        {noVideo ? (
          <button
            type="button"
            onClick={onAddVideo}
            className={cn(
              'inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-md border border-ochre/50 px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ochre hover:bg-ochre/10',
              focusRing,
            )}
          >
            <IconVideo size={12} aria-hidden /> {t('addVideoCta')}
          </button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-teal/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-teal">
            <IconVideo size={11} aria-hidden /> {t('chipVideoOk')}
          </span>
        )}

        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'up'))} disabled={index === 0} className={iconBtn} aria-label={t('moveUp')} title={t('moveUp')}><IconChevronUp size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'down'))} disabled={index === total - 1} className={iconBtn} aria-label={t('moveDown')} title={t('moveDown')}><IconChevronDown size={12} /></button>
          {/* Bigger, unmissable expand affordance (Stage 1). */}
          <button
            type="button"
            onClick={() => onToggleExpand(lesson.id)}
            aria-expanded={expanded}
            aria-label={expanded ? t('collapseLesson') : t('expandLesson')}
            title={expanded ? t('collapseLesson') : t('expandLesson')}
            className={cn('grid h-8 w-8 shrink-0 place-items-center rounded border border-ink/15 text-ink/60 hover:bg-ink/[0.06]', focusRing)}
          >
            {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </button>
        </span>
      </div>

      {expanded && (
        <div className="border-t border-ink/10 px-2.5 pb-2.5">
          <LessonEditPanel
            slug={slug}
            lesson={lesson}
            isDraft={isDraft}
            actions={actions}
            chapters={chapters}
            bilingual={bilingual}
            primaryLocale={primaryLocale}
            onAct={onAct}
          />
        </div>
      )}
    </li>
  );
}
