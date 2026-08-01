'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconPlus, IconTrash, IconChevronUp, IconChevronDown, IconChevronRight, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { AdminChapter, AdminLesson, ChapterPatch } from '@/lib/courses/write';
import { inputCls } from '../fields';
import { focusRing, iconBtn } from './shared';
import { LessonRow } from './LessonRow';
import type { LessonActions } from './types';

/** A course chapter (part/module), its own lessons list, up/down/delete —
 *  unchanged behaviour from the pre-split `LessonsManager.tsx`, just moved
 *  into its own file (Task A2 #3) and now threading the plan-wide
 *  `expandedId` accordion state down to each `LessonRow`. */
export function ChapterGroup({
  slug,
  chapter,
  index,
  total,
  lessons,
  chapters,
  isDraft,
  onAct,
  actions,
  bilingual,
  primaryLocale,
  expandedId,
  onToggleExpand,
}: {
  slug: string;
  chapter: AdminChapter;
  index: number;
  total: number;
  lessons: AdminLesson[];
  chapters: AdminChapter[];
  isDraft: boolean;
  onAct: (fn: () => Promise<{ ok: boolean }>) => void;
  actions: LessonActions;
  /** The parent course's optional-translation setting (Task: lesson-language)
   *  — threaded straight through to each `LessonRow`. */
  bilingual: boolean;
  primaryLocale: 'ht' | 'fr';
  expandedId: string | null;
  onToggleExpand: (lessonId: string) => void;
}) {
  const t = useTranslations('admin.cms.lessons');
  const [titleHt, setTitleHt] = useState(chapter.title_ht);
  const [titleFr, setTitleFr] = useState(chapter.title_fr);
  const [summaryHt, setSummaryHt] = useState(chapter.summary_ht);
  const [summaryFr, setSummaryFr] = useState(chapter.summary_fr);
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commit = (patch: ChapterPatch) => onAct(() => actions.updateChapter(slug, chapter.id, patch));

  return (
    <div className="rounded-lg border border-ink/15 bg-paper/70 p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? t('collapseChapter') : t('expandChapter')}
          className={iconBtn}
        >
          {expanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input
              value={titleHt}
              onChange={(e) => setTitleHt(e.target.value)}
              onBlur={() => titleHt !== chapter.title_ht && commit({ title_ht: titleHt })}
              placeholder={t('chapterTitleHt')}
              className={cn(inputCls, 'font-semibold')}
            />
            <input
              value={titleFr}
              onChange={(e) => setTitleFr(e.target.value)}
              onBlur={() => titleFr !== chapter.title_fr && commit({ title_fr: titleFr })}
              placeholder={t('chapterTitleFr')}
              className={cn(inputCls, 'font-semibold')}
            />
          </div>
          {expanded && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              <input
                value={summaryHt}
                onChange={(e) => setSummaryHt(e.target.value)}
                onBlur={() => summaryHt !== chapter.summary_ht && commit({ summary_ht: summaryHt })}
                placeholder={t('chapterSummaryHt')}
                className={inputCls}
              />
              <input
                value={summaryFr}
                onChange={(e) => setSummaryFr(e.target.value)}
                onBlur={() => summaryFr !== chapter.summary_fr && commit({ summary_fr: summaryFr })}
                placeholder={t('chapterSummaryFr')}
                className={inputCls}
              />
            </div>
          )}
        </div>

        <span className="flex shrink-0 flex-col gap-0.5">
          <button type="button" onClick={() => onAct(() => actions.reorderChapter(slug, chapter.id, 'up'))} disabled={index === 0} className={iconBtn}><IconChevronUp size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.reorderChapter(slug, chapter.id, 'down'))} disabled={index === total - 1} className={iconBtn}><IconChevronDown size={12} /></button>
          {!confirmDelete && (
            <button type="button" aria-label={t('deleteChapterAria')} onClick={() => setConfirmDelete(true)} className={cn(iconBtn, 'text-stampred')}><IconTrash size={12} /></button>
          )}
        </span>
      </div>

      {confirmDelete && (
        <div className="mt-2 rounded-lg border border-stampred/30 bg-stampred/5 p-2.5">
          <p className="flex items-start gap-1.5 text-xs leading-snug text-graphite/80">
            <IconAlertTriangle size={14} className="mt-0.5 shrink-0 text-stampred" /> {t('deleteChapterConfirm')}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onAct(() => actions.deleteChapter(slug, chapter.id))}
              className={cn('rounded bg-stampred px-2.5 py-1 font-mono text-[10px] font-semibold text-paper-light', focusRing)}
            >
              {t('deleteChapterYes')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className={cn('rounded border border-ink/15 px-2.5 py-1 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]', focusRing)}
            >
              {t('deleteChapterNo')}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-2.5 space-y-2 border-l-2 border-ink/10 pl-3">
          {lessons.length === 0 ? (
            <p className="font-mono text-[11px] text-graphite/45">{t('empty')}</p>
          ) : (
            <ul className="space-y-2">
              {lessons.map((l, i) => (
                <LessonRow
                  key={l.id}
                  slug={slug}
                  lesson={l}
                  index={i}
                  total={lessons.length}
                  isDraft={isDraft}
                  onAct={onAct}
                  actions={actions}
                  chapters={chapters}
                  bilingual={bilingual}
                  primaryLocale={primaryLocale}
                  expandedId={expandedId}
                  onToggleExpand={onToggleExpand}
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() =>
              onAct(async () => {
                const res = await actions.addLesson(slug);
                if (res.ok && res.lessonId) {
                  const moved = await actions.moveLessonToChapter(slug, res.lessonId, chapter.id);
                  if (!moved.ok) return moved;
                }
                return res;
              })
            }
            className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline', focusRing)}
          >
            <IconPlus size={12} /> {t('addLessonInChapter')}
          </button>
        </div>
      )}
    </div>
  );
}
