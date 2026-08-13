/**
 * Thin re-export shim (Task A2 — course editor UX overhaul). The 539-line
 * implementation that used to live directly in this file is now split into
 * `./plan/{PlanEditor,ChapterGroup,LessonRow,LessonEditPanel}.tsx` — this
 * file exists so the teacher studio's
 * `/enseigner/studio/cours/[slug]/editer/page.tsx` (the ONLY call site,
 * since Stage 1 — the admin no longer authors course content) keeps
 * importing `{ LessonsManager, type LessonActions }` from this exact path
 * with this exact prop contract — no import-path churn, no DI-shape changes.
 */
export { PlanEditor as LessonsManager } from './plan/PlanEditor';
export type { LessonActions } from './plan/types';
