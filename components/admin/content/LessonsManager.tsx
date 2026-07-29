'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconAlertTriangle,
  IconVideo,
  IconVideoOff,
} from '@tabler/icons-react';
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
import type { AdminLesson, AdminChapter, LessonPatch, ChapterPatch } from '@/lib/courses/write';
import type { BunnyUploadResult } from '@/lib/bunny/upload';
import type { CourseResource } from '@/db/schema';
import { VideoUpload } from '@/components/content/VideoUpload';
import { ResourcesEditor } from '@/components/content/ResourcesEditor';
import { inputCls } from './fields';

type ContentResult = { ok: boolean; message?: string; slug?: string; count?: number; lessonId?: string };

/**
 * lib/admin/content-actions.ts's 11 lesson/chapter actions (Task K2 — plan de
 * cours complet: 6 lesson ops from before + 5 new chapter/move ops) — the
 * studio (Task C3-T4 / K2) injects its own owner-scoped versions here
 * instead. Kept as ONE flat action bag (not split lesson/chapter bags) so
 * both call sites only ever thread a single `actions` prop through, same as
 * before this task.
 */
export type LessonActions = {
  addLesson: (slug: string) => Promise<ContentResult>;
  updateLesson: (slug: string, lessonId: string, patch: LessonPatch) => Promise<ContentResult>;
  deleteLesson: (slug: string, lessonId: string) => Promise<ContentResult>;
  moveLesson: (slug: string, lessonId: string, dir: 'up' | 'down') => Promise<ContentResult>;
  validateBunnyVideo: (videoId: string) => Promise<ContentResult>;
  /** Autonomous upload (Task: video upload): creates the Bunny video object
   *  + TUS upload authorization for this lesson. Studio/admin each inject
   *  their own ownership/capability-gated version (createMyVideoUploadAction
   *  / createVideoUploadAction) — see components/content/VideoUpload.tsx. */
  createUpload: (slug: string, lessonId: string, title: string) => Promise<BunnyUploadResult>;
  /** Task K2 — chapters (a course's parts/modules). */
  createChapter: (slug: string, input: { title_ht: string; title_fr: string }) => Promise<ContentResult>;
  updateChapter: (slug: string, chapterId: string, patch: ChapterPatch) => Promise<ContentResult>;
  deleteChapter: (slug: string, chapterId: string) => Promise<ContentResult>;
  reorderChapter: (slug: string, chapterId: string, dir: 'up' | 'down') => Promise<ContentResult>;
  moveLessonToChapter: (slug: string, lessonId: string, chapterId: string | null) => Promise<ContentResult>;
};

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

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const iconBtn =
  'grid h-6 w-6 place-items-center rounded border border-ink/15 text-ink/55 hover:bg-ink/[0.04] disabled:opacity-30 ' +
  focusRing;

function secToMmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function mmssToSec(v: string): number {
  const [m, s] = v.split(':').map((x) => Number(x) || 0);
  return v.includes(':') ? m * 60 + (s || 0) : (Number(v) || 0);
}

/**
 * The course PLAN EDITOR (Task K2 — plan de cours complet): chapters as
 * groups, each with its own lessons, plus an "hors chapitre" bucket for
 * lessons with `chapterId === null`. Kept the `LessonsManager`/`LessonActions`
 * names (rather than renaming the file) so both existing call sites — the
 * admin CMS's `/admin/cours/[slug]/editer` and the teacher studio's
 * `/enseigner/studio/cours/[slug]/editer` — need only extend the `actions`
 * object they already inject, no import-path churn.
 *
 * BACKWARD COMPATIBLE BY CONSTRUCTION: a course with zero chapters has every
 * lesson's `chapterId === null` (see db/schema.ts's file header), so it
 * renders as a single flat "hors chapitre" bucket with NO chapter heading
 * (`chapters.length === 0` hides the "Hors chapitre" label entirely) — same
 * `LessonRow` list, same up/down/delete, same empty state as before this task.
 */
export function LessonsManager({
  slug,
  lessons,
  chapters = [],
  isDraft,
  actions = defaultLessonActions,
}: {
  slug: string;
  lessons: AdminLesson[];
  /** A course's parts/modules (Task K2) — `[]` for every flat, pre-K2 course. */
  chapters?: AdminChapter[];
  isDraft: boolean;
  /** Injected by the teacher studio (Task C3-T4 / K2); defaults to the admin
   *  CMS actions so every existing `/admin/cours/[slug]/editer` call site is
   *  unchanged. */
  actions?: LessonActions;
}) {
  const t = useTranslations('admin.cms.lessons');
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean }>) => start(async () => { if ((await fn()).ok) router.refresh(); });

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

function ChapterGroup({
  slug,
  chapter,
  index,
  total,
  lessons,
  chapters,
  isDraft,
  onAct,
  actions,
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
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() =>
              onAct(async () => {
                const res = await actions.addLesson(slug);
                if (res.ok && res.lessonId) await actions.moveLessonToChapter(slug, res.lessonId, chapter.id);
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

function LessonRow({
  slug,
  lesson,
  index,
  total,
  isDraft,
  onAct,
  actions,
  chapters,
}: {
  slug: string;
  lesson: AdminLesson;
  index: number;
  total: number;
  isDraft: boolean;
  onAct: (fn: () => Promise<{ ok: boolean }>) => void;
  actions: LessonActions;
  chapters: AdminChapter[];
}) {
  const t = useTranslations('admin.cms.lessons');
  const router = useRouter();
  const [titleHt, setTitleHt] = useState(lesson.title_ht);
  const [titleFr, setTitleFr] = useState(lesson.title_fr);
  const [descHt, setDescHt] = useState(lesson.desc_ht);
  const [descFr, setDescFr] = useState(lesson.desc_fr);
  const [video, setVideo] = useState(lesson.bunnyVideoId);
  const [dur, setDur] = useState(secToMmss(lesson.durationSeconds));
  const [bunny, setBunny] = useState<string | null>(null);
  const [vp, vStart] = useTransition();

  // Task K2 — notes + resources, collapsed by default unless already filled
  // (so a course authored before this task, or a lesson someone already put
  // notes/links on, never hides existing content behind a collapsed toggle).
  const [expanded, setExpanded] = useState(
    () => Boolean(lesson.notes_ht || lesson.notes_fr || lesson.resources.length > 0),
  );
  const [notesHt, setNotesHt] = useState(lesson.notes_ht);
  const [notesFr, setNotesFr] = useState(lesson.notes_fr);
  const [resources, setResources] = useState<CourseResource[]>(lesson.resources);
  const [resourcesErr, setResourcesErr] = useState<string | null>(null);
  const [rp, rStart] = useTransition();

  const noVideo = !lesson.bunnyVideoId;

  const commit = (patch: LessonPatch) => onAct(() => actions.updateLesson(slug, lesson.id, patch));

  /**
   * `resources` is an array field — there's no single input to "blur" the
   * way a scalar text field has, so it commits when focus leaves the WHOLE
   * notes/resources block (the wrapping `onBlur` below checks
   * `relatedTarget` is actually outside the container, the standard
   * a11y-safe "focus really left this subtree" check — a click that moves
   * focus between two rows inside ResourcesEditor, e.g. adding a row, does
   * NOT fire this). Reported separately from `commit`/`onAct` above (its own
   * transition + router) so a rejection (`validateResource`'s error code)
   * can be shown inline instead of silently discarded like the other fields.
   */
  const commitResources = (next: CourseResource[]) =>
    rStart(async () => {
      const res = await actions.updateLesson(slug, lesson.id, { resources: next });
      if (res.ok) {
        setResourcesErr(null);
        router.refresh();
      } else {
        setResourcesErr(res.message ?? 'error');
      }
    });

  return (
    <li className={cn('rounded-lg border bg-paper p-2.5', noVideo && !isDraft ? 'border-stampred/40' : 'border-ink/10')}>
      <div className="flex items-start gap-2">
        <span className="mt-1 font-mono text-[10px] text-ink/40">{index + 1}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input value={titleHt} onChange={(e) => setTitleHt(e.target.value)} onBlur={() => titleHt !== lesson.title_ht && commit({ title_ht: titleHt })} placeholder={t('titleHt')} className={inputCls} />
            <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} onBlur={() => titleFr !== lesson.title_fr && commit({ title_fr: titleFr })} placeholder={t('titleFr')} className={inputCls} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <textarea value={descHt} onChange={(e) => setDescHt(e.target.value)} onBlur={() => descHt !== lesson.desc_ht && commit({ desc_ht: descHt })} placeholder={t('descHt')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
            <textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} onBlur={() => descFr !== lesson.desc_fr && commit({ desc_fr: descFr })} placeholder={t('descFr')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1">
              {noVideo ? <IconVideoOff size={13} className="text-stampred" /> : <IconVideo size={13} className="text-teal" />}
              <input value={video} onChange={(e) => setVideo(e.target.value)} onBlur={() => video !== lesson.bunnyVideoId && commit({ bunnyVideoId: video })} placeholder={t('bunnyId')} className={cn(inputCls, 'w-44')} />
            </span>
            <button
              type="button"
              disabled={vp}
              onClick={() => vStart(async () => { const r = await actions.validateBunnyVideo(video); setBunny(r.ok ? (r.message === 'unvalidated_mock' ? t('bunnyMock') : t('bunnyOk')) : t('bunnyBad')); })}
              className={cn('rounded border border-ink/15 px-2 py-1 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]', focusRing)}
            >
              {vp ? <IconLoader2 size={11} className="animate-spin" /> : t('validate')}
            </button>
            {bunny && <span className="font-mono text-[10px] text-ink/55">{bunny}</span>}
            <VideoUpload
              lessonTitle={titleHt || titleFr || lesson.title_ht || lesson.title_fr}
              createUpload={(title) => actions.createUpload(slug, lesson.id, title)}
              onUploaded={(guid) => {
                setVideo(guid);
                onAct(() => actions.updateLesson(slug, lesson.id, { bunnyVideoId: guid }));
              }}
            />
            <input value={dur} onChange={(e) => setDur(e.target.value)} onBlur={() => commit({ durationSeconds: mmssToSec(dur) })} placeholder="mm:ss" className={cn(inputCls, 'w-16 text-center')} />
            <label className="flex items-center gap-1 font-mono text-[10px] text-ink/60">
              <input type="checkbox" checked={lesson.isPreview} onChange={(e) => commit({ isPreview: e.target.checked })} className="h-3.5 w-3.5 accent-ochre" />
              {t('preview')}
            </label>
          </div>
          {noVideo && !isDraft && (
            <p className="flex items-center gap-1 font-mono text-[10px] text-stampred"><IconAlertTriangle size={11} /> {t('noVideoWarn')}</p>
          )}

          {/* Task K2 — move to chapter */}
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-ink/55">
            {t('moveTo')}
            <select
              value={lesson.chapterId ?? ''}
              onChange={(e) => onAct(() => actions.moveLessonToChapter(slug, lesson.id, e.target.value || null))}
              className={cn(inputCls, 'w-auto cursor-pointer py-1 font-mono text-[11px]')}
            >
              <option value="">{t('ungrouped')}</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.title_ht || c.title_fr || `#${c.sortOrder}`}</option>
              ))}
            </select>
          </label>

          {/* Task K2 — notes + resources, collapsible */}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className={cn('inline-flex items-center gap-1 font-mono text-[10px] text-ink/50 hover:text-ink', focusRing)}
          >
            {expanded ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />} {t('notesToggle')}
          </button>
          {expanded && (
            <div
              className="space-y-2.5 rounded-lg border border-ink/10 bg-paper-light/70 p-2.5"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (JSON.stringify(resources) !== JSON.stringify(lesson.resources)) commitResources(resources);
                }
              }}
            >
              <div>
                <span className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">
                  {t('notesTitle')} {rp && <IconLoader2 size={11} className="animate-spin text-ink/40" />}
                </span>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <textarea value={notesHt} onChange={(e) => setNotesHt(e.target.value)} onBlur={() => notesHt !== lesson.notes_ht && commit({ notes_ht: notesHt })} placeholder={t('notesHt')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
                  <textarea value={notesFr} onChange={(e) => setNotesFr(e.target.value)} onBlur={() => notesFr !== lesson.notes_fr && commit({ notes_fr: notesFr })} placeholder={t('notesFr')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
                </div>
              </div>
              <ResourcesEditor resources={resources} onChange={setResources} serverError={resourcesErr} />
            </div>
          )}
        </div>
        <span className="flex shrink-0 flex-col gap-0.5">
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'up'))} disabled={index === 0} className={iconBtn}><IconChevronUp size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'down'))} disabled={index === total - 1} className={iconBtn}><IconChevronDown size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.deleteLesson(slug, lesson.id))} className={cn(iconBtn, 'text-stampred')}><IconTrash size={12} /></button>
        </span>
      </div>
    </li>
  );
}
