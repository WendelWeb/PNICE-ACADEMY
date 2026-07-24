/**
 * lib/courses/source.ts — the single course data-access module (Task C2-T1).
 *
 * Returns the SAME `Course`/`Lesson` shape the app already consumes today
 * (data/courses.ts) so that when C2-T3 points the public/learner surfaces at
 * this module instead of `@/data/courses`, the change is close to a drop-in
 * (`import { courses } from '@/data/courses'` → `await getAllCourses()`).
 *
 * GATED + FALLBACK (never throws):
 *   no DATABASE_URL, OR the DB query fails, OR `courses` has 0 rows
 *     ⇒ fall back to the static `data/courses.ts` seed data (the same 9
 *       formations the site has always shipped with).
 * This is what keeps dev/build/mock working before the DB tables are pushed
 * live and seeded (scripts/seed-courses.ts, Task C2-T2) — mirrors the
 * DB-read pattern in lib/learner/access.ts and lib/admin/data/real/users.ts.
 *
 * `data/courseDetails.ts` (the sales-page CourseDetail content, keyed by
 * `code`) is NOT read here — the `Course` type this module returns has no
 * sales-page fields. `data/courseDetails.ts` remains in the repo as part of
 * the seed source for the new `courses` table's sales-page columns
 * (promise/problem/deliverables/prereq/faq — see db/schema.ts), consumed by
 * scripts/seed-courses.ts (Task C2-T2), not by this module.
 */
import { db, schema } from '@/db';
import {
  courses as staticCourses,
  getCourse as getStaticCourse,
  type Course,
  type Lesson,
} from '@/data/courses';

const T = schema;

type DbCourseRow = typeof T.courses.$inferSelect;
type DbLessonRow = typeof T.lessons.$inferSelect;

/** True only when a DB read is even worth attempting. */
function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Pure DB-row → app-shape mapper (exported for unit testing without a real
 * DB connection). `lessonRows` may contain lessons for other courses too —
 * this filters to `row.slug` and sorts by `index` itself.
 */
export function mapDbCourseToCourse(row: DbCourseRow, lessonRows: DbLessonRow[]): Course {
  const lessons: Lesson[] = lessonRows
    .filter((l) => l.courseSlug === row.slug)
    .sort((a, b) => a.index - b.index)
    .map((l) => ({
      title_ht: l.titleHt,
      title_fr: l.titleFr,
      bunnyVideoId: l.bunnyVideoId ?? undefined,
    }));

  return {
    code: row.code ?? row.slug,
    slug: row.slug,
    icon: row.icon ?? 'book',
    category: row.category ?? 'lavi-pratik',
    priceUsd: (row.priceCents ?? 0) / 100,
    title_ht: row.titleHt ?? '',
    title_fr: row.titleFr ?? '',
    tagline_ht: row.taglineHt ?? '',
    tagline_fr: row.taglineFr ?? '',
    learn_ht: row.learnHt ?? [],
    learn_fr: row.learnFr ?? [],
    audience_ht: row.audienceHt ?? '',
    audience_fr: row.audienceFr ?? '',
    lessons,
  };
}

/**
 * Reads `courses` + `lessons` from the DB. Returns `null` (never throws) when
 * there's no DATABASE_URL, the query fails, or `courses` is empty — the
 * single choke point every exported read below falls back through.
 */
async function readDbRows(): Promise<{ courseRows: DbCourseRow[]; lessonRows: DbLessonRow[] } | null> {
  if (!dbConfigured()) return null;

  try {
    const [courseRows, lessonRows] = await Promise.all([
      db.select().from(T.courses),
      db.select().from(T.lessons),
    ]);
    if (courseRows.length === 0) return null;
    return { courseRows, lessonRows };
  } catch (err) {
    console.error('[courses/source] DB read failed, falling back to static data:', err);
    return null;
  }
}

export async function getAllCourses(): Promise<Course[]> {
  const rows = await readDbRows();
  if (!rows) return staticCourses;
  return rows.courseRows.map((r) => mapDbCourseToCourse(r, rows.lessonRows));
}

export async function getCourseBySlug(slug: string): Promise<Course | undefined> {
  const rows = await readDbRows();
  if (!rows) return getStaticCourse(slug);
  const row = rows.courseRows.find((r) => r.slug === slug);
  return row ? mapDbCourseToCourse(row, rows.lessonRows) : undefined;
}

/**
 * Only `status = 'published'` courses — what the public catalog/sales pages
 * show (Task C2-T3). With no DB (fallback), the static catalog IS today's
 * live/published set, so every static course is returned.
 */
export async function getPublishedCourses(): Promise<Course[]> {
  const rows = await readDbRows();
  if (!rows) return staticCourses;
  return rows.courseRows
    .filter((r) => r.status === 'published')
    .map((r) => mapDbCourseToCourse(r, rows.lessonRows));
}

export async function getCourseLessons(slug: string): Promise<Lesson[]> {
  const course = await getCourseBySlug(slug);
  return course?.lessons ?? [];
}
