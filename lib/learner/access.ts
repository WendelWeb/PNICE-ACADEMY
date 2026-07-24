/**
 * Learner access + progress reads (Drizzle) — Task L1 (buy → learn).
 *
 * Access model (BINDING — docs/superpowers/plans/2026-07-23-launch-code.md):
 * a signed-in user has access to a course's lessons if ANY of:
 *   (a) an active `enrollments` row for that course_slug
 *   (b) an active `subscriptions` row (today the $79 pass grants ALL of
 *       data/courses.ts — PNICE has one teacher, so all 9 courses)
 * Free-preview lessons are handled by the LESSON PAGE itself (data/courses.ts
 * `isPreviewLesson`), not here — a course can be previewed with no access at
 * all.
 *
 * Every export is safe to call with no DATABASE_URL, Clerk disabled, signed
 * out, or no matching `users` row — it degrades to an empty/false result and
 * NEVER throws, mirroring the DB-read pattern in lib/admin/data/real/users.ts
 * and the "no DB ⇒ empty state" constraint from the launch-code plan.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { courses } from '@/data/courses';
import { clerkEnabled } from '@/lib/clerk';

const T = schema;
const courseBySlug = new Map(courses.map((c) => [c.slug, c]));

export type MyCourse = {
  slug: string;
  lessonsDone: number;
  lessonsTotal: number;
  /** 1-based lesson index to resume at — min(lessonsDone + 1, lessonsTotal). */
  lastLessonIndex: number;
};

/** True only when a real DB read is actually possible. */
function dbReady(): boolean {
  return Boolean(process.env.DATABASE_URL) && clerkEnabled;
}

/** clerkId → users.id. Null if no DB row exists yet (e.g. webhook hasn't synced). */
export async function resolveUserId(clerkId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: T.users.id })
    .from(T.users)
    .where(eq(T.users.clerkId, clerkId))
    .limit(1);
  return row?.id ?? null;
}

export async function getMyLearning(
  clerkId: string,
): Promise<{ courses: MyCourse[]; hasSubscription: boolean }> {
  const empty = { courses: [], hasSubscription: false };
  if (!dbReady() || !clerkId) return empty;

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return empty;

    const [enrolls, subs, prog] = await Promise.all([
      db
        .select()
        .from(T.enrollments)
        .where(and(eq(T.enrollments.userId, userId), eq(T.enrollments.status, 'active'))),
      db
        .select()
        .from(T.subscriptions)
        .where(and(eq(T.subscriptions.userId, userId), eq(T.subscriptions.status, 'active'))),
      db.select().from(T.progress).where(eq(T.progress.userId, userId)),
    ]);

    const hasSubscription = subs.length > 0;
    const enrolledSlugs = new Set(enrolls.map((e) => e.courseSlug));
    // A subscriber has access to every course with NO per-course enrollment
    // row, so a course they've actually made progress in (but never bought
    // individually) must still surface here — otherwise their real activity
    // would be invisible on their own dashboard. Individually-enrolled
    // courses always show, even at 0 progress (mirrors the pre-L1 demo's
    // done:0 entry for a freshly-bought course).
    const progressSlugs = new Set(
      prog.filter((p) => p.completedAt).map((p) => p.courseSlug),
    );
    const slugs = hasSubscription ? new Set([...enrolledSlugs, ...progressSlugs]) : enrolledSlugs;

    const result: MyCourse[] = [];
    for (const slug of slugs) {
      const course = courseBySlug.get(slug);
      if (!course) continue; // stale/unknown slug — skip defensively
      const lessonsTotal = course.lessons.length;
      const lessonsDone = prog.filter((p) => p.courseSlug === slug && p.completedAt).length;
      result.push({
        slug,
        lessonsDone,
        lessonsTotal,
        lastLessonIndex: Math.min(lessonsDone + 1, Math.max(lessonsTotal, 1)),
      });
    }
    return { courses: result, hasSubscription };
  } catch (err) {
    console.error('[learner/access] getMyLearning failed:', err);
    return empty;
  }
}

export async function hasCourseAccess(clerkId: string, courseSlug: string): Promise<boolean> {
  if (!dbReady() || !clerkId) return false;

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return false;

    const [enrollment] = await db
      .select({ id: T.enrollments.id })
      .from(T.enrollments)
      .where(
        and(
          eq(T.enrollments.userId, userId),
          eq(T.enrollments.courseSlug, courseSlug),
          eq(T.enrollments.status, 'active'),
        ),
      )
      .limit(1);
    if (enrollment) return true;

    const [sub] = await db
      .select({ id: T.subscriptions.id })
      .from(T.subscriptions)
      .where(and(eq(T.subscriptions.userId, userId), eq(T.subscriptions.status, 'active')))
      .limit(1);
    return Boolean(sub);
  } catch (err) {
    console.error('[learner/access] hasCourseAccess failed:', err);
    return false;
  }
}

export async function getCourseProgress(
  clerkId: string,
  courseSlug: string,
): Promise<Set<number>> {
  if (!dbReady() || !clerkId) return new Set();

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return new Set();

    const rows = await db
      .select({ lessonIndex: T.progress.lessonIndex })
      .from(T.progress)
      .where(
        and(
          eq(T.progress.userId, userId),
          eq(T.progress.courseSlug, courseSlug),
          isNotNull(T.progress.completedAt),
        ),
      );
    return new Set(rows.map((r) => r.lessonIndex));
  } catch (err) {
    console.error('[learner/access] getCourseProgress failed:', err);
    return new Set();
  }
}
