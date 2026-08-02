'use client';

import { useLocale, useTranslations } from 'next-intl';
import { IconChevronUp, IconChevronDown, IconChevronRight, IconVideo, IconVideoOff } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { AdminLesson, AdminChapter } from '@/lib/courses/write';
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

  const displayTitle =
    (locale === 'ht' ? lesson.title_ht : lesson.title_fr) || lesson.title_ht || lesson.title_fr || t('untitledLesson');

  return (
    // `id` is the studio bon-de-contrôle rail's jump target for this
    // lesson's readiness gaps (missing video/title, no preview lesson yet —
    // Task D1); `PlanEditor`'s hash/`studio:jump-lesson` listener expands
    // this row first so the jump lands on the real field, not just the row.
    <li id={`lesson-${lesson.id}`} className={cn('rounded-lg border bg-paper', noVideo && !isDraft ? 'border-stampred/40' : 'border-ink/10')}>
      <div className="flex items-center gap-2 p-2.5">
        <span className="shrink-0 font-mono text-[10px] text-ink/40">{index + 1}</span>

        <button
          type="button"
          onClick={() => onToggleExpand(lesson.id)}
          aria-expanded={expanded}
          className={cn('flex min-w-0 flex-1 items-center gap-2 rounded text-left', focusRing)}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{displayTitle}</span>

          <span className="shrink-0 font-mono text-[10px] text-ink/45 tabular-nums">{secToMmss(lesson.durationSeconds)}</span>

          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide',
              noVideo ? 'bg-stampred/10 text-stampred' : 'bg-teal/10 text-teal',
            )}
          >
            {noVideo ? <IconVideoOff size={11} /> : <IconVideo size={11} />}
            {noVideo ? t('chipVideoMissing') : t('chipVideoOk')}
          </span>

          {lesson.isPreview && (
            <span className="shrink-0 rounded bg-ochre/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ochre">
              {t('preview')}
            </span>
          )}
        </button>

        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'up'))} disabled={index === 0} className={iconBtn} aria-label={t('moveUp')}><IconChevronUp size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'down'))} disabled={index === total - 1} className={iconBtn} aria-label={t('moveDown')}><IconChevronDown size={12} /></button>
          <button
            type="button"
            onClick={() => onToggleExpand(lesson.id)}
            aria-expanded={expanded}
            aria-label={expanded ? t('collapseLesson') : t('expandLesson')}
            className={iconBtn}
          >
            {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
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
