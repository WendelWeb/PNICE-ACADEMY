/**
 * lib/courses/readiness.ts — the course "is this actually ready?" checklist
 * (Task K2, plan de cours complet). Pure, framework-agnostic (no DB, no
 * next-intl) so it's importable from both server pages (admin CMS + teacher
 * studio editor pages) and the client `components/content/CourseReadiness.tsx`
 * without pulling in `lib/courses/write.ts`'s DB-touching module (only its
 * TYPES are imported here, erased at compile time).
 *
 * DELIBERATELY A WARNING LIST, NOT A GATE: nothing here blocks a save or a
 * submit-for-review click — admin review is the real gate (see the K2 plan).
 * This only powers the ✓/✗ checklist UI and the "N point(s) à compléter"
 * badge next to the studio's submit button / the admin's publish button.
 */
import type { AdminCourse } from './write';
import { MIN_COURSE_PRICE_CENTS } from './pricing-rules';

export type ReadinessKey =
  | 'hasLesson'
  | 'allLessonsHaveVideo'
  | 'allLessonsTitled'
  | 'allChaptersTitled'
  | 'pricePositive'
  | 'promiseFilled'
  | 'hasPreviewLesson'
  | 'mainImageSet';

export type ReadinessItem = { key: ReadinessKey; ok: boolean };

/** Only the fields the checklist actually reads — lets a caller pass a
 *  partial/mocked course in tests without building a full `AdminCourse`. */
export type ReadinessCourse = Pick<
  AdminCourse,
  'lessons' | 'chapters' | 'priceCents' | 'promise_ht' | 'promise_fr' | 'mainImage'
>;

/**
 * Order matches the K2 spec's own list: at least 1 lesson; every lesson has
 * a video; every lesson has both titles; every chapter has both titles (if
 * any); price > 0; promise/description filled; at least 1 preview lesson;
 * main image set.
 *
 * `allLessonsHaveVideo`/`allLessonsTitled` deliberately require `lessons.length
 * > 0` to read ✓ — otherwise an empty course would vacuously pass both
 * (`Array.every` on `[]` is `true`), which would read as false reassurance
 * next to a course that has no lessons at all (`hasLesson` already flags
 * that, but each item is shown independently, so it must be honest on its
 * own). `allChaptersTitled` is the deliberate exception: a course with zero
 * chapters has nothing to title, so it reads ✓ (see `AdminCourse.chapters`'s
 * doc comment — `[]` is the normal, backward-compatible flat-course shape).
 */
export function computeCourseReadiness(course: ReadinessCourse): ReadinessItem[] {
  const lessons = course.lessons;
  const chapters = course.chapters ?? [];

  return [
    { key: 'hasLesson', ok: lessons.length > 0 },
    { key: 'allLessonsHaveVideo', ok: lessons.length > 0 && lessons.every((l) => Boolean(l.bunnyVideoId)) },
    {
      key: 'allLessonsTitled',
      ok: lessons.length > 0 && lessons.every((l) => l.title_ht.trim() !== '' && l.title_fr.trim() !== ''),
    },
    {
      key: 'allChaptersTitled',
      ok: chapters.length === 0 || chapters.every((c) => c.title_ht.trim() !== '' && c.title_fr.trim() !== ''),
    },
    // 0 = explicitly FREE (a legitimate, ready state since the owner's
    // « gratuit est un choix » rule); otherwise the $1 minimum applies —
    // 1-99 cents is an accident the save path refuses anyway.
    { key: 'pricePositive', ok: course.priceCents === 0 || course.priceCents >= MIN_COURSE_PRICE_CENTS },
    { key: 'promiseFilled', ok: course.promise_ht.trim() !== '' && course.promise_fr.trim() !== '' },
    { key: 'hasPreviewLesson', ok: lessons.some((l) => l.isPreview) },
    { key: 'mainImageSet', ok: Boolean(course.mainImage) },
  ];
}

export function countMissingReadiness(items: ReadinessItem[]): number {
  return items.filter((i) => !i.ok).length;
}
