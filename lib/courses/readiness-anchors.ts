/**
 * lib/courses/readiness-anchors.ts — the studio editor's "bon de contrôle"
 * rail (Task D1 — authoring masterpiece / le bordereau): which of the 4
 * numbered steps a `ReadinessKey` belongs to, and which DOM anchor id a click
 * on that checklist row should scroll+focus. Pure, framework-agnostic (no
 * DB, no React, no `window`) — same reasoning as the sibling `readiness.ts`
 * this file sits next to: importable from the server page (to compute the
 * anchors once per render) AND from the client `ControlRail` (to know which
 * step a click belongs to), without pulling in anything DOM-specific. The
 * actual `scrollIntoView`/`.focus()` mechanics live in
 * `components/teacher/studio/jump.ts` — a separate, browser-only module.
 *
 * Step keys are DELIBERATELY the same 4 strings the editor's `?tab=` query
 * param already used pre-D1 (`infos`/`plan`/`medias`/`ressources`) — the
 * bordereau's ① L'essentiel / ② Le plan / ③ Médias / ④ Ressources are a new
 * PRESENTATION of the same 4 steps, not a new set of URLs, so every existing
 * link/bookmark into `?tab=plan` etc. keeps working unchanged.
 */
import type { ReadinessCourse, ReadinessKey } from './readiness';

export type EditorStepKey = 'infos' | 'plan' | 'medias' | 'ressources';

/** Order matches the bordereau's own numbering (① → ④). */
export const EDITOR_STEPS: { key: EditorStepKey; number: number }[] = [
  { key: 'infos', number: 1 },
  { key: 'plan', number: 2 },
  { key: 'medias', number: 3 },
  { key: 'ressources', number: 4 },
];

export type ReadinessAnchor = { step: EditorStepKey; anchorId: string };

/**
 * Every readiness item's target: which step to navigate to, and which
 * element id to scroll+focus once that step's panel is mounted. The
 * corresponding `id="…"` is placed on the actual DOM element by the field's
 * own component (`CourseEditor`'s price/promise fields, `ImagesManager`'s
 * main-image block, `PlanEditor`'s add-lesson button, each `LessonRow`/
 * `ChapterGroup`'s root element) — this function only decides WHICH id, it
 * never touches the DOM itself.
 *
 * For the 4 lesson/chapter-list items (`hasLesson`, `allLessonsTitled`,
 * `allLessonsHaveVideo`, `allChaptersTitled`, `hasPreviewLesson`) there can be
 * several offending rows — this always points at the FIRST one, top to
 * bottom, matching how a teacher would naturally work through the list.
 * `hasLesson` (no lessons at all) and a chapter-less `allChaptersTitled` both
 * fall back to the plan's own "add a lesson" button — there is no row to
 * point at yet.
 */
export function computeReadinessAnchors(course: ReadinessCourse): Record<ReadinessKey, ReadinessAnchor> {
  const lessons = course.lessons;
  const chapters = course.chapters ?? [];

  const missingVideoLesson = lessons.find((l) => !l.bunnyVideoId);
  const missingTitleLesson = lessons.find((l) => l.title_ht.trim() === '' || l.title_fr.trim() === '');
  const missingTitleChapter = chapters.find((c) => c.title_ht.trim() === '' || c.title_fr.trim() === '');
  const firstLesson = lessons[0];

  const lessonAnchor = (l?: { id: string }): string => (l ? `lesson-${l.id}` : 'plan-add-lesson');

  return {
    pricePositive: { step: 'infos', anchorId: 'field-price' },
    promiseFilled: { step: 'infos', anchorId: 'field-promise' },
    hasLesson: { step: 'plan', anchorId: 'plan-add-lesson' },
    allLessonsTitled: { step: 'plan', anchorId: lessonAnchor(missingTitleLesson) },
    allLessonsHaveVideo: { step: 'plan', anchorId: lessonAnchor(missingVideoLesson) },
    allChaptersTitled: {
      step: 'plan',
      anchorId: missingTitleChapter ? `chapter-${missingTitleChapter.id}` : 'plan-add-lesson',
    },
    hasPreviewLesson: { step: 'plan', anchorId: lessonAnchor(firstLesson) },
    mainImageSet: { step: 'medias', anchorId: 'field-main-image' },
  };
}
