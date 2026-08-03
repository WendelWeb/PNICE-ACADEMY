'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconPlus, IconTrash, IconChevronUp, IconChevronDown, IconChevronRight, IconAlertTriangle, IconFolder, IconNotes } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { AdminChapter, AdminLesson, ChapterPatch } from '@/lib/courses/write';
import { Field, inputCls, MONO_LOCALE_NAME } from '../fields';
import { focusRing, iconBtn } from './shared';
import { LessonRow } from './LessonRow';
import type { LessonActions, LessonUploadInfo, LessonUploadPhaseHandler } from './types';

function hasText(v: string): boolean {
  return v.trim() !== '';
}

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
  uploadEnabled,
  expandedId,
  onToggleExpand,
  uploads,
  onUploadPhase,
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
  /** The parent course's optional-translation setting (Task: lesson-language,
   *  extended to the chapter's own title/summary by Task: chapter-language)
   *  — used directly below (see `mono`) for THIS chapter's title/summary
   *  fields, and also threaded straight through to each `LessonRow`. */
  bilingual: boolean;
  primaryLocale: 'ht' | 'fr';
  /** "Is the document upload rail configured?" (Stage 4) — threaded straight
   *  through to each `LessonRow`, exactly like `bilingual`. */
  uploadEnabled: boolean;
  expandedId: string | null;
  onToggleExpand: (lessonId: string) => void;
  /** Stage 5 (optional, additive) — the plan-wide per-lesson upload map +
   *  phase callback, threaded straight through to each `LessonRow` exactly
   *  like `bilingual`. See types.ts's `LessonUploadInfo`. */
  uploads?: Record<string, LessonUploadInfo>;
  onUploadPhase?: LessonUploadPhaseHandler;
}) {
  const t = useTranslations('admin.cms.lessons');
  // Task: chapter-language — same `mono` convention `LessonEditPanel` uses
  // (`undefined` = bilingual, render both ht+fr; 'ht'/'fr' = monolingual,
  // render ONE input for that locale only). A monolingual course must not
  // force a teacher to fill in a chapter title/summary they can't read —
  // `mirrorBilingualFields` (now fed `CHAPTER_BILINGUAL_PAIR_COLUMNS`, see
  // lib/courses/write.ts's `updateChapter`) is what actually keeps the
  // hidden column in sync on save; this component only ever commits the
  // primary locale's own field, exactly like the lesson fields above it.
  const mono = bilingual ? undefined : primaryLocale;
  const [titleHt, setTitleHt] = useState(chapter.title_ht);
  const [titleFr, setTitleFr] = useState(chapter.title_fr);
  const [summaryHt, setSummaryHt] = useState(chapter.summary_ht);
  const [summaryFr, setSummaryFr] = useState(chapter.summary_fr);
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commit = (patch: ChapterPatch) => onAct(() => actions.updateChapter(slug, chapter.id, patch));

  return (
    // `id` is the studio bon-de-contrôle rail's jump target for
    // `allChaptersTitled` (Task D1) — chapters are expanded by default
    // (`expanded` state above defaults to `true`), so its title inputs are
    // always in the DOM, no accordion coordination needed.
    //
    // The "kraft band" (Task D2 #5): a chapter is a structural BAND —
    // solid `bg-paper` (the brand's own kraft tone), a visible left accent
    // border, and an eyebrow badge — visually distinct from `LessonRow`'s
    // lighter `bg-paper-light` card floating inside it, so the
    // chapter→lesson hierarchy reads at a glance, not just from indentation.
    <div id={`chapter-${chapter.id}`} className="rounded-lg border border-ink/20 border-l-4 border-l-ink/30 bg-paper p-3">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink/45">
        <IconFolder size={13} aria-hidden /> {t('chapterBadge', { n: index + 1 })}
      </p>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? t('collapseChapter') : t('expandChapter')}
          title={expanded ? t('collapseChapter') : t('expandChapter')}
          className={iconBtn}
        >
          {expanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <Field
            icon={IconFolder}
            label={
              mono ? (
                <>
                  {t('chapterTitleLabel')} <span className="text-ink/40">· {MONO_LOCALE_NAME[mono]}</span>
                </>
              ) : (
                t('chapterTitleLabel')
              )
            }
            hint={t('hints.chapterTitle')}
            example={t('examples.chapterTitle')}
            filled={mono ? hasText(mono === 'ht' ? titleHt : titleFr) : hasText(titleHt) && hasText(titleFr)}
          >
            {mono ? (
              mono === 'ht' ? (
                <input
                  value={titleHt}
                  onChange={(e) => setTitleHt(e.target.value)}
                  onBlur={() => titleHt !== chapter.title_ht && commit({ title_ht: titleHt })}
                  placeholder={t('chapterTitleHt')}
                  aria-label={`${t('chapterTitleLabel')} · Kreyòl`}
                  className={cn(inputCls, 'font-semibold')}
                />
              ) : (
                <input
                  value={titleFr}
                  onChange={(e) => setTitleFr(e.target.value)}
                  onBlur={() => titleFr !== chapter.title_fr && commit({ title_fr: titleFr })}
                  placeholder={t('chapterTitleFr')}
                  aria-label={`${t('chapterTitleLabel')} · Français`}
                  className={cn(inputCls, 'font-semibold')}
                />
              )
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                <input
                  value={titleHt}
                  onChange={(e) => setTitleHt(e.target.value)}
                  onBlur={() => titleHt !== chapter.title_ht && commit({ title_ht: titleHt })}
                  placeholder={t('chapterTitleHt')}
                  aria-label={`${t('chapterTitleLabel')} · Kreyòl`}
                  className={cn(inputCls, 'font-semibold')}
                />
                <input
                  value={titleFr}
                  onChange={(e) => setTitleFr(e.target.value)}
                  onBlur={() => titleFr !== chapter.title_fr && commit({ title_fr: titleFr })}
                  placeholder={t('chapterTitleFr')}
                  aria-label={`${t('chapterTitleLabel')} · Français`}
                  className={cn(inputCls, 'font-semibold')}
                />
              </div>
            )}
          </Field>
          {expanded && (
            <Field
              icon={IconNotes}
              label={
                mono ? (
                  <>
                    {t('chapterSummaryLabel')} <span className="text-ink/40">· {MONO_LOCALE_NAME[mono]}</span>
                  </>
                ) : (
                  t('chapterSummaryLabel')
                )
              }
              hint={t('hints.chapterSummary')}
              example={t('examples.chapterSummary')}
            >
              {mono ? (
                mono === 'ht' ? (
                  <input
                    value={summaryHt}
                    onChange={(e) => setSummaryHt(e.target.value)}
                    onBlur={() => summaryHt !== chapter.summary_ht && commit({ summary_ht: summaryHt })}
                    placeholder={t('chapterSummaryHt')}
                    aria-label={`${t('chapterSummaryLabel')} · Kreyòl`}
                    className={inputCls}
                  />
                ) : (
                  <input
                    value={summaryFr}
                    onChange={(e) => setSummaryFr(e.target.value)}
                    onBlur={() => summaryFr !== chapter.summary_fr && commit({ summary_fr: summaryFr })}
                    placeholder={t('chapterSummaryFr')}
                    aria-label={`${t('chapterSummaryLabel')} · Français`}
                    className={inputCls}
                  />
                )
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <input
                    value={summaryHt}
                    onChange={(e) => setSummaryHt(e.target.value)}
                    onBlur={() => summaryHt !== chapter.summary_ht && commit({ summary_ht: summaryHt })}
                    placeholder={t('chapterSummaryHt')}
                    aria-label={`${t('chapterSummaryLabel')} · Kreyòl`}
                    className={inputCls}
                  />
                  <input
                    value={summaryFr}
                    onChange={(e) => setSummaryFr(e.target.value)}
                    onBlur={() => summaryFr !== chapter.summary_fr && commit({ summary_fr: summaryFr })}
                    placeholder={t('chapterSummaryFr')}
                    aria-label={`${t('chapterSummaryLabel')} · Français`}
                    className={inputCls}
                  />
                </div>
              )}
            </Field>
          )}
        </div>

        <span className="flex shrink-0 flex-col gap-0.5">
          <button type="button" onClick={() => onAct(() => actions.reorderChapter(slug, chapter.id, 'up'))} disabled={index === 0} aria-label={t('moveUp')} title={t('moveUp')} className={iconBtn}><IconChevronUp size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.reorderChapter(slug, chapter.id, 'down'))} disabled={index === total - 1} aria-label={t('moveDown')} title={t('moveDown')} className={iconBtn}><IconChevronDown size={12} /></button>
          {!confirmDelete && (
            <button type="button" aria-label={t('deleteChapterAria')} title={t('deleteChapterAria')} onClick={() => setConfirmDelete(true)} className={cn(iconBtn, 'text-stampred')}><IconTrash size={12} /></button>
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
                  uploadEnabled={uploadEnabled}
                  expandedId={expandedId}
                  onToggleExpand={onToggleExpand}
                  uploadInfo={uploads?.[l.id]}
                  onUploadPhase={onUploadPhase}
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
