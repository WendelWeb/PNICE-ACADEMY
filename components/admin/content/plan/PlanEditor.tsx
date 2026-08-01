'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconPlus, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import {
  addLessonAction,
  updateLessonAction,
  deleteLessonAction,
  moveLessonAction,
  validateBunnyVideoAction,
  createVideoUploadAction,
  createChapterAction,
  updateChapterAction,
  deleteChapterAction,
  reorderChapterAction,
  moveLessonToChapterAction,
} from '@/lib/admin/content-actions';
import type { AdminLesson, AdminChapter } from '@/lib/courses/write';
import { focusRing } from './shared';
import { ChapterGroup } from './ChapterGroup';
import { LessonRow } from './LessonRow';
import type { LessonActions } from './types';

export type { LessonActions } from './types';

const defaultLessonActions: LessonActions = {
  addLesson: addLessonAction,
  updateLesson: updateLessonAction,
  deleteLesson: deleteLessonAction,
  moveLesson: moveLessonAction,
  validateBunnyVideo: validateBunnyVideoAction,
  createUpload: createVideoUploadAction,
  createChapter: createChapterAction,
  updateChapter: updateChapterAction,
  deleteChapter: deleteChapterAction,
  reorderChapter: reorderChapterAction,
  moveLessonToChapter: moveLessonToChapterAction,
};

/**
 * The course PLAN EDITOR (Task K2 — plan de cours complet; split into
 * focused components under Task A2 — course editor UX overhaul, formerly
 * one 539-line `LessonsManager.tsx`): chapters as groups, each with its own
 * lessons, plus an "hors chapitre" bucket for lessons with `chapterId ===
 * null`. Exported as `LessonsManager` from the sibling `../LessonsManager.tsx`
 * shim (Task A2 constraint: keep the existing exported entry point name/props
 * so BOTH existing call sites — the admin CMS's `/admin/cours/[slug]/editer`
 * and the teacher studio's `/enseigner/studio/cours/[slug]/editer` — need no
 * import-path or prop changes, only their own already-injected `actions`
 * object.
 *
 * BACKWARD COMPATIBLE BY CONSTRUCTION: a course with zero chapters has every
 * lesson's `chapterId === null` (see db/schema.ts's file header), so it
 * renders as a single flat "hors chapitre" bucket with NO chapter heading
 * (`chapters.length === 0` hides the "Hors chapitre" label entirely) — same
 * `LessonRow` list, same up/down/delete, same empty state as before Task A2.
 *
 * Task A2 #4 — lessons collapsed by default, ONE expanded at a time
 * (accordion): `expandedId` lives HERE (not per-`ChapterGroup`) so opening a
 * lesson in one chapter collapses whatever was open in another chapter or in
 * the ungrouped bucket — a single, obvious "what's open" story across the
 * whole plan.
 */
export function PlanEditor({
  slug,
  lessons,
  chapters = [],
  isDraft,
  bilingual = true,
  primaryLocale = 'ht',
  actions = defaultLessonActions,
}: {
  slug: string;
  lessons: AdminLesson[];
  /** A course's parts/modules (Task K2) — `[]` for every flat, pre-K2 course. */
  chapters?: AdminChapter[];
  isDraft: boolean;
  /**
   * The course's optional-translation setting (Task: lesson-language) —
   * threaded down to `LessonEditPanel` so a monolingual course's lessons show
   * ONE title/desc/notes input instead of forced ht+fr pairs (see that
   * component's doc comment). Defaults to `true`/`'ht'` (a fully bilingual
   * course, same behaviour as every course before this task) so a call site
   * that hasn't been updated yet still renders the pre-existing paired UI —
   * plain data props, NOT part of the `actions` DI contract below.
   */
  bilingual?: boolean;
  primaryLocale?: 'ht' | 'fr';
  /** Injected by the teacher studio (Task C3-T4 / K2); defaults to the admin
   *  CMS actions so every existing `/admin/cours/[slug]/editer` call site is
   *  unchanged. */
  actions?: LessonActions;
}) {
  const t = useTranslations('admin.cms.lessons');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean }>) => start(async () => { if ((await fn()).ok) router.refresh(); });
  const toggleExpand = (lessonId: string) => setExpandedId((cur) => (cur === lessonId ? null : lessonId));

  const chaptersSorted = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);
  const byChapter = new Map<string, AdminLesson[]>();
  for (const l of lessons) {
    if (!l.chapterId) continue;
    const arr = byChapter.get(l.chapterId) ?? [];
    arr.push(l);
    byChapter.set(l.chapterId, arr);
  }
  const ungrouped = lessons.filter((l) => !l.chapterId);
  const isEmpty = chaptersSorted.length === 0 && lessons.length === 0;

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')} · {lessons.length}</h2>
        {pending && <IconLoader2 size={14} className="animate-spin text-ink/40" />}
      </div>

      {isEmpty ? (
        <p className="mt-3 font-mono text-xs text-graphite/55">{t('empty')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {chaptersSorted.map((chapter, i) => (
            <ChapterGroup
              key={chapter.id}
              slug={slug}
              chapter={chapter}
              index={i}
              total={chaptersSorted.length}
              lessons={byChapter.get(chapter.id) ?? []}
              chapters={chaptersSorted}
              isDraft={isDraft}
              onAct={act}
              actions={actions}
              bilingual={bilingual}
              primaryLocale={primaryLocale}
              expandedId={expandedId}
              onToggleExpand={toggleExpand}
            />
          ))}

          <div className={chaptersSorted.length > 0 ? 'rounded-lg border border-dashed border-ink/15 p-3' : undefined}>
            {chaptersSorted.length > 0 && (
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('ungrouped')}</h3>
            )}
            {ungrouped.length === 0 ? (
              chaptersSorted.length > 0 && <p className="font-mono text-[11px] text-graphite/45">{t('empty')}</p>
            ) : (
              <ul className="space-y-2">
                {ungrouped.map((l, i) => (
                  <LessonRow
                    key={l.id}
                    slug={slug}
                    lesson={l}
                    index={i}
                    total={ungrouped.length}
                    isDraft={isDraft}
                    onAct={act}
                    actions={actions}
                    chapters={chaptersSorted}
                    bilingual={bilingual}
                    primaryLocale={primaryLocale}
                    expandedId={expandedId}
                    onToggleExpand={toggleExpand}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => act(() => actions.addLesson(slug))}
          className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline', focusRing)}
        >
          <IconPlus size={13} /> {t('add')}
        </button>
        <button
          type="button"
          onClick={() => act(() => actions.createChapter(slug, { title_ht: '', title_fr: '' }))}
          className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-ochre hover:underline', focusRing)}
        >
          <IconPlus size={13} /> {t('addChapter')}
        </button>
      </div>
    </section>
  );
}
