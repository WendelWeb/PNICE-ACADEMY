/**
 * Real (Drizzle) Course sales + detail domain — closes the gap flagged by
 * review: getCourseSales/getCourseDetail were still mock-only despite every
 * real mutation writing to the real payments/enrollments/certificates/
 * progress tables (used live by /admin/cours and /admin/cours/[slug]).
 *
 * The mock (`lib/admin/data/mock/index.ts` getCourseSales/getCourseDetail,
 * fed by `courseStats` in ./dataset.ts) is the reference for shape/semantics;
 * this file reproduces it from real rows, reusing the exact "enrolled"/
 * "doneMap" reconstruction already established in ../engagement.ts
 * (enrolledIdsFor / buildDoneMap) so a course's numbers agree whether viewed
 * from /admin/cours/[slug] or /admin/engagement.
 *
 * SCHEMA-DRIVEN DEGENERACIES / adaptations (documented once, not per method):
 *
 *  1. "completions" mirrors the mock's own `courseStats` generator EXACTLY: a
 *     CERTIFICATE count for the course, not a progress-based full-completion
 *     count (dataset.ts: `completions = certificates.filter(courseSlug)
 *     .length`). This is a different counter from engagement.ts's
 *     `getCourseCompletion().completedCount` (progress-based) — not a
 *     contradiction, the mock itself already has two distinct counters for
 *     two distinct screens (`AdminCourseStat.completions` vs
 *     `CourseCompletionRow.completedCount`) and this mirrors each faithfully
 *     on its own screen.
 *  2. "enrolled" = distinct users with an ACTIVE `enrollments` row for the
 *     course (same degeneracy already documented in ../engagement.ts —
 *     subscribers who never bought/were-granted a course individually have no
 *     enrollments row and won't appear here).
 *  3. `progress` is a PER-LESSON row (userId, courseSlug, lessonIndex,
 *     completedAt, lastPositionSeconds), not the mock's per-(user,course)
 *     `lessonsDone` counter. "opened lesson i" / "completed lesson i" are
 *     reconstructed as `doneCount >= i` / `>= i+1` — the SAME reconstruction
 *     ../engagement.ts's getLessonViews/getAggregateDropoff already use for
 *     the identical mock semantics ("reached lesson i" = lessonsDone >= i) —
 *     so the per-lesson funnel here never disagrees with the engagement
 *     screens for the same course.
 *  4. `avgWatchMinutes` is MOCK-SYNTHETIC there (a deterministic hash with no
 *     real meaning). Here it is genuinely real: `progress` rows carry a real
 *     per-lesson-index `lastPositionSeconds`, so this averages that across
 *     every progress row recorded at that lesson index and converts to
 *     minutes — an improvement over the mock, not a gap. 0 on a lesson with
 *     no progress rows yet.
 *  5. `published` is always `true`, exactly like the mock's hardcoded
 *     `courseStats[].published = true` — this method reads course rows via
 *     `lib/courses/source.ts`'s `getAllCourses()` (DB-backed, gated, falls
 *     back to the static `data/courses.ts` catalog, Task C2-T5 — was a
 *     direct static import before), so it still has no per-row status to
 *     report on its own; the real draft/published status is merged in
 *     separately by the /admin/cours PAGE (lib/courses/write.ts's
 *     `getAdminCourses`).
 *  6. Every division is guarded exactly like the mock: 0 enrolled ⇒
 *     completionRatePct 0 (never NaN); 0 opened ⇒ dropPct 0; no progress rows
 *     at a lesson index ⇒ avgWatchMinutes 0. A near-empty DB returns the same
 *     zeroed shape, never throws.
 */
import { db, schema } from '@/db';
import { getAllCourses } from '@/lib/courses/source';
import type { Course } from '@/data/courses';
import type { CourseDetail, CourseSalesRow, LessonFunnel } from '../types';

const T = schema;

type DbEnroll = typeof T.enrollments.$inferSelect;
type DbProgress = typeof T.progress.$inferSelect;
type DbPayment = typeof T.payments.$inferSelect;
type DbCert = typeof T.certificates.$inferSelect;

async function loadBase() {
  const [enrolls, prog, payments, certs] = await Promise.all([
    db.select().from(T.enrollments),
    db.select().from(T.progress),
    db.select().from(T.payments),
    db.select().from(T.certificates),
  ]);
  return { enrolls, prog, payments, certs };
}

/** Mirrors ../engagement.ts's enrolledIdsFor exactly (see file note 2). */
function enrolledIdsFor(slug: string, enrolls: DbEnroll[]): string[] {
  return [
    ...new Set(
      enrolls.filter((e) => e.courseSlug === slug && e.status === 'active').map((e) => e.userId),
    ),
  ];
}

/** Mirrors ../engagement.ts's buildDoneMap/doneCount exactly (see file note 3). */
function buildDoneMap(prog: DbProgress[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const p of prog) {
    if (!p.completedAt) continue;
    let byCourse = m.get(p.userId);
    if (!byCourse) {
      byCourse = new Map();
      m.set(p.userId, byCourse);
    }
    byCourse.set(p.courseSlug, (byCourse.get(p.courseSlug) ?? 0) + 1);
  }
  return m;
}
function doneCount(m: Map<string, Map<string, number>>, userId: string, slug: string): number {
  return m.get(userId)?.get(slug) ?? 0;
}

function statFor(
  c: Course,
  enrolls: DbEnroll[],
  payments: DbPayment[],
  certs: DbCert[],
): CourseSalesRow {
  const enrolled = enrolledIdsFor(c.slug, enrolls).length;
  const revenueCents = payments
    .filter((p) => p.courseSlug === c.slug && p.status === 'completed')
    .reduce((s, p) => s + p.amountCents, 0);
  const completions = certs.filter((ct) => ct.courseSlug === c.slug).length;
  return {
    slug: c.slug,
    code: c.code,
    title_fr: c.title_fr,
    title_ht: c.title_ht,
    priceUsdCents: c.priceUsd * 100,
    enrollments: enrolled,
    revenueCents,
    completions,
    completionRatePct: enrolled ? (completions / enrolled) * 100 : 0,
    lessonsCount: c.lessons.length,
    published: true,
  };
}

export async function getCourseSales(): Promise<CourseSalesRow[]> {
  const [courses, { enrolls, payments, certs }] = await Promise.all([getAllCourses(), loadBase()]);
  return courses.map((c) => statFor(c, enrolls, payments, certs));
}

export async function getCourseDetail(slug: string): Promise<CourseDetail | null> {
  const courses = await getAllCourses();
  const course = courses.find((c) => c.slug === slug);
  if (!course) return null;

  const { enrolls, prog, payments, certs } = await loadBase();
  const enrolledIds = enrolledIdsFor(slug, enrolls);
  const enrolled = enrolledIds.length;
  const doneMap = buildDoneMap(prog);

  // Per-lesson-index avg watch time — real signal, see file note 4.
  const positionSum = new Map<number, number>();
  const positionCount = new Map<number, number>();
  for (const p of prog) {
    if (p.courseSlug !== slug) continue;
    positionSum.set(p.lessonIndex, (positionSum.get(p.lessonIndex) ?? 0) + p.lastPositionSeconds);
    positionCount.set(p.lessonIndex, (positionCount.get(p.lessonIndex) ?? 0) + 1);
  }

  const lessons: LessonFunnel[] = course.lessons.map((lesson, i) => {
    const opened = enrolledIds.filter((id) => doneCount(doneMap, id, slug) >= i).length;
    const completed = enrolledIds.filter((id) => doneCount(doneMap, id, slug) >= i + 1).length;
    const neverOpened = enrolled - opened;
    const cnt = positionCount.get(i) ?? 0;
    const avgWatchMinutes = cnt ? Math.round(positionSum.get(i)! / cnt / 60) : 0;
    return {
      index: i,
      title_fr: lesson.title_fr,
      title_ht: lesson.title_ht,
      opened,
      completed,
      neverOpened,
      dropPct: opened ? ((opened - completed) / opened) * 100 : 0,
      avgWatchMinutes,
    };
  });

  // Worst lesson = largest absolute opened→completed drop (first max wins, mirrors the mock).
  let worstLessonIndex: number | null = null;
  let worstDrop = -1;
  for (const l of lessons) {
    const drop = l.opened - l.completed;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstLessonIndex = l.index;
    }
  }

  return {
    course: statFor(course, enrolls, payments, certs),
    enrolled,
    lessons,
    worstLessonIndex,
  };
}
