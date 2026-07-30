/**
 * Thin re-export shim (Task A2 — course editor UX overhaul). The 539-line
 * implementation that used to live directly in this file is now split into
 * `./plan/{PlanEditor,ChapterGroup,LessonRow,LessonEditPanel}.tsx` — this
 * file exists ONLY so both existing call sites (the admin CMS's
 * `/admin/cours/[slug]/editer/page.tsx` and the teacher studio's
 * `/enseigner/studio/cours/[slug]/editer/page.tsx`) keep importing
 * `{ LessonsManager, type LessonActions }` from this exact path with this
 * exact prop contract — no import-path churn, no DI-shape changes.
 */
export { PlanEditor as LessonsManager } from './plan/PlanEditor';
export type { LessonActions } from './plan/types';
