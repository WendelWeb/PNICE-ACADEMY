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
 * `code`) IS read here too, via `getCourseDetail(slug)` (Task C2-T3) — see
 * that function's own doc comment for the mapping/fallback details.
 */
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '@/db';
import {
  courses as staticCourses,
  getCourse as getStaticCourse,
  type Course,
  type Lesson,
} from '@/data/courses';
import {
  getCourseDetail as getStaticCourseDetail,
  type CourseDetail,
  type CourseFaq,
  type LessonDetail,
  type CourseChapterView,
  type CurriculumLesson,
} from '@/data/courseDetails';

const T = schema;

type DbCourseRow = typeof T.courses.$inferSelect;
type DbLessonRow = typeof T.lessons.$inferSelect;
type DbChapterRow = typeof T.courseChapters.$inferSelect;

/**
 * True only when a DB read is even worth attempting. Exported so
 * lib/courses/write.ts (Task C2-T4) gates its mutations behind the exact same
 * check — one source of truth for "is the live DB usable right now".
 */
export function dbConfigured(): boolean {
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

/**
 * A single course, but ONLY if `status = 'published'` (undefined otherwise,
 * including "exists but draft/pending/rejected/archived") — what the public
 * SALES PAGE (Task C2-T3) must resolve through so an unpublished course
 * 404s for visitors, mirroring `getPublishedCourses()`'s filter. With no DB
 * (fallback), every static course counts as published (today's real,
 * always-public catalog), same reasoning as `getPublishedCourses()`.
 */
export async function getPublishedCourseBySlug(slug: string): Promise<Course | undefined> {
  const rows = await readDbRows();
  if (!rows) return getStaticCourse(slug);
  const row = rows.courseRows.find((r) => r.slug === slug && r.status === 'published');
  return row ? mapDbCourseToCourse(row, rows.lessonRows) : undefined;
}

/**
 * Pure DB-row → `CourseDetail` mapper (Task C2-T3), exported for unit
 * testing without a real DB connection. Every field — INCLUDING
 * `level_ht/fr` (`courses.level_ht/fr`) and the per-lesson `desc_ht/fr`
 * (`lessons.desc_ht/fr`), both added in Task C2-T4 to close the schema gap
 * this comment used to flag — prefers its DB column and falls back to the
 * static `data/courseDetails.ts` entry matched by `code` only when that
 * column is null: a brand-new teacher-authored course (future C3) with no
 * static counterpart gets safe empty defaults instead of a crash, while a
 * freshly-seeded row (scripts/seed-courses.ts writes every one of these
 * columns, level/desc included) round-trips to IDENTICAL content. Lesson
 * `minutes` comes from the real `lessons.duration_seconds` column when
 * present (falling back to the static minutes otherwise).
 */
export function mapDbCourseToDetail(
  row: DbCourseRow,
  lessonRows: DbLessonRow[],
  chapterRows: DbChapterRow[] = [],
): CourseDetail {
  const staticDetail = row.code ? getStaticCourseDetail(row.code) : undefined;

  const lessons = lessonRows
    .filter((l) => l.courseSlug === row.slug)
    .sort((a, b) => a.index - b.index);

  const lessonDetails: LessonDetail[] = lessons.map((l, i) => {
    const staticLd = staticDetail?.lessonDetails[i];
    return {
      minutes:
        l.durationSeconds != null ? Math.round(l.durationSeconds / 60) : staticLd?.minutes ?? 0,
      desc_ht: l.descHt ?? staticLd?.desc_ht ?? '',
      desc_fr: l.descFr ?? staticLd?.desc_fr ?? '',
    };
  });

  // Task K1 — curriculum grouping. Built from the SAME `lessons`/`lessonDetails`
  // arrays above (index-aligned) so a lesson's rich fields (minutes/desc, via
  // the same DB-then-static fallback) are never recomputed twice.
  const toCurriculumLesson = (l: DbLessonRow, i: number): CurriculumLesson => ({
    id: l.id,
    index: l.index,
    title_ht: l.titleHt,
    title_fr: l.titleFr,
    desc_ht: lessonDetails[i].desc_ht,
    desc_fr: lessonDetails[i].desc_fr,
    minutes: lessonDetails[i].minutes,
    bunnyVideoId: l.bunnyVideoId ?? undefined,
    isPreview: l.isPreview,
    notes_ht: l.notesHt ?? '',
    notes_fr: l.notesFr ?? '',
    resources: l.resources ?? [],
  });

  const chaptersSorted = [...chapterRows].sort((a, b) => a.index - b.index);
  const chapters: CourseChapterView[] = chaptersSorted.map((c) => ({
    id: c.id,
    title_ht: c.titleHt,
    title_fr: c.titleFr,
    summary_ht: c.summaryHt ?? '',
    summary_fr: c.summaryFr ?? '',
    lessons: lessons
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.chapterId === c.id)
      .map(({ l, i }) => toCurriculumLesson(l, i)),
  }));
  const ungroupedLessons: CurriculumLesson[] = lessons
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !l.chapterId)
    .map(({ l, i }) => toCurriculumLesson(l, i));

  const faqHt = row.faqHt ?? [];
  const faqFr = row.faqFr ?? [];
  const faq: CourseFaq[] =
    faqHt.length > 0
      ? faqHt.map((f, i) => ({
          q_ht: f.q,
          a_ht: f.a,
          q_fr: faqFr[i]?.q ?? '',
          a_fr: faqFr[i]?.a ?? '',
        }))
      : staticDetail?.faq ?? [];

  return {
    level_ht: row.levelHt ?? staticDetail?.level_ht ?? '',
    level_fr: row.levelFr ?? staticDetail?.level_fr ?? '',
    promise_ht: row.promiseHt ?? staticDetail?.promise_ht ?? '',
    promise_fr: row.promiseFr ?? staticDetail?.promise_fr ?? '',
    problem_ht: row.problemHt ?? staticDetail?.problem_ht ?? '',
    problem_fr: row.problemFr ?? staticDetail?.problem_fr ?? '',
    deliverables_ht: row.deliverablesHt ?? staticDetail?.deliverables_ht ?? [],
    deliverables_fr: row.deliverablesFr ?? staticDetail?.deliverables_fr ?? [],
    requirements_ht: row.prereqHt ?? staticDetail?.requirements_ht ?? [],
    requirements_fr: row.prereqFr ?? staticDetail?.requirements_fr ?? [],
    lessonDetails,
    faq,
    chapters,
    ungroupedLessons,
  };
}

/**
 * Every `course_chapters` row for `slug`, ordered by `index` — the DB half of
 * the curriculum grouping (Task K1). GATED + FALLBACK, same choke point as
 * every other read here: no DATABASE_URL or a failed query ⇒ `[]`, never
 * throws — `mapDbCourseToDetail` then reports zero chapters, same as a
 * course that genuinely has none.
 */
async function readChapterRows(slug: string): Promise<DbChapterRow[]> {
  if (!dbConfigured()) return [];
  try {
    return await db
      .select()
      .from(T.courseChapters)
      .where(eq(T.courseChapters.courseSlug, slug))
      .orderBy(asc(T.courseChapters.index));
  } catch (err) {
    console.error('[courses/source] readChapterRows DB read failed, falling back to []:', err);
    return [];
  }
}

/**
 * The sales-page long-form content for one course, keyed by `slug` (unlike
 * the static `data/courseDetails.ts`, keyed by `code` — this module is
 * slug-keyed throughout, like every other export here). GATED + FALLBACK,
 * same choke point as the rest of this module: no DATABASE_URL, a failed
 * query, or an empty `courses` table ⇒ resolve the slug against the static
 * catalog and read `data/courseDetails.ts` by its `code`, byte-identical to
 * what the sales page fetched before Task C2-T3 (no `chapters`/
 * `ungroupedLessons` — see `CourseDetail`'s own doc comment, Task K1).
 */
export async function getCourseDetail(slug: string): Promise<CourseDetail | undefined> {
  const rows = await readDbRows();
  if (!rows) {
    const course = getStaticCourse(slug);
    return course ? getStaticCourseDetail(course.code) : undefined;
  }
  const row = rows.courseRows.find((r) => r.slug === slug);
  if (!row) return undefined;
  const chapterRows = await readChapterRows(slug);
  return mapDbCourseToDetail(row, rows.lessonRows, chapterRows);
}
