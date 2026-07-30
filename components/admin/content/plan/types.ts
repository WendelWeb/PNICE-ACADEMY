/**
 * Shared types for the course PLAN EDITOR (Task A2 — course editor UX
 * overhaul). Extracted from the pre-split `LessonsManager.tsx` (539 lines)
 * so `PlanEditor`/`ChapterGroup`/`LessonRow`/`LessonEditPanel` can each import
 * just the type they need without a circular dependency on the barrel file
 * (`../LessonsManager.tsx`, kept as a thin re-export shim for both existing
 * call sites — see that file's header comment).
 */
import type { AdminLesson, AdminChapter, LessonPatch, ChapterPatch } from '@/lib/courses/write';
import type { BunnyUploadResult } from '@/lib/bunny/upload';

export type ContentResult = { ok: boolean; message?: string; slug?: string; count?: number; lessonId?: string };

/**
 * lib/admin/content-actions.ts's 11 lesson/chapter actions (Task K2 — plan de
 * cours complet: 6 lesson ops from before + 5 new chapter/move ops) — the
 * studio (Task C3-T4 / K2) injects its own owner-scoped versions here
 * instead. Kept as ONE flat action bag (not split lesson/chapter bags) so
 * both call sites only ever thread a single `actions` prop through, same as
 * before this task. UNCHANGED by the Task A2 UI split — this is the exact
 * DI contract both `/admin/cours/[slug]/editer` and
 * `/enseigner/studio/cours/[slug]/editer` already depend on.
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

/** Shared props threaded from `PlanEditor` down through `ChapterGroup` to `LessonRow`. */
export type PlanCommonProps = {
  slug: string;
  isDraft: boolean;
  onAct: (fn: () => Promise<{ ok: boolean }>) => void;
  actions: LessonActions;
  chapters: AdminChapter[];
  /** Accordion (Task A2 #4): only one lesson panel open at a time, lifted to
   *  `PlanEditor` so it stays true across chapters + the ungrouped bucket. */
  expandedId: string | null;
  onToggleExpand: (lessonId: string) => void;
};

export type { AdminLesson, AdminChapter };
