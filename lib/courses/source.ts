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
      // The teacher's own free-preview choice. This mapper used to drop it,
      // which is precisely why the lesson gate fell back to "lesson 1 is
      // always free" — the flag existed in the DB and on the sales page, but
      // never reached the code that decides who may watch. See
      // data/courses.ts's `isPreviewLesson`.
      isPreview: l.isPreview === true,
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
    // Optional course translation (Task: course-language) — see Course's own
    // doc comment. `row.bilingual`/`row.primaryLocale` are NOT NULL in the
    // schema, but `withLegacyCourseDefaults` below can hand this mapper a
    // pre-migration row where they were never selected — `?? true`/`?? 'ht'`
    // covers that (and is a no-op once the column always has a real value).
    bilingual: row.bilingual ?? true,
    primary_locale: row.primaryLocale ?? 'ht',
    // Stage 3 — course photos: expose the teacher-set images jsonb so the
    // public surfaces can resolve DB-first (see lib/courseImage.ts's
    // `courseImageList`). `undefined` (not null) when the row has none, so a
    // DB course without photos falls back exactly like a static one.
    images: row.images ?? undefined,
    tags: row.tags ?? undefined,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : undefined,
  };
}

/**
 * Every `courses` column that predates the `primary_locale`/`bilingual`
 * migration (Task: course-language) — Drizzle's `db.select()` (no columns
 * given) names EVERY schema column, so on a live DB that hasn't had
 * `npm run db:push` run yet for THIS migration, that whole query fails
 * outright. `selectCourseRows`/`selectCourseRowBySlug`/
 * `selectCourseRowsByOwner` below retry with just this list on failure —
 * mirrors lib/teacher/profile.ts's `getTeacherProfile` retry pattern — so a
 * teacher's real, DB-authored courses don't vanish (or the studio doesn't
 * 500) for the window between deploying this code and running `db:push`.
 */
const LEGACY_COURSE_COLUMNS = {
  id: T.courses.id,
  ownerUserId: T.courses.ownerUserId,
  slug: T.courses.slug,
  code: T.courses.code,
  icon: T.courses.icon,
  category: T.courses.category,
  titleHt: T.courses.titleHt,
  titleFr: T.courses.titleFr,
  taglineHt: T.courses.taglineHt,
  taglineFr: T.courses.taglineFr,
  audienceHt: T.courses.audienceHt,
  audienceFr: T.courses.audienceFr,
  learnHt: T.courses.learnHt,
  learnFr: T.courses.learnFr,
  levelHt: T.courses.levelHt,
  levelFr: T.courses.levelFr,
  promiseHt: T.courses.promiseHt,
  promiseFr: T.courses.promiseFr,
  problemHt: T.courses.problemHt,
  problemFr: T.courses.problemFr,
  deliverablesHt: T.courses.deliverablesHt,
  deliverablesFr: T.courses.deliverablesFr,
  prereqHt: T.courses.prereqHt,
  prereqFr: T.courses.prereqFr,
  faqHt: T.courses.faqHt,
  faqFr: T.courses.faqFr,
  priceCents: T.courses.priceCents,
  currency: T.courses.currency,
  images: T.courses.images,
  status: T.courses.status,
  reviewNote: T.courses.reviewNote,
  submittedAt: T.courses.submittedAt,
  reviewedBy: T.courses.reviewedBy,
  publishedAt: T.courses.publishedAt,
  hasUnpublishedChanges: T.courses.hasUnpublishedChanges,
  resources: T.courses.resources,
  bunnyCollectionId: T.courses.bunnyCollectionId,
  createdAt: T.courses.createdAt,
  updatedAt: T.courses.updatedAt,
} as const;

type LegacyCourseRow = { [K in keyof typeof LEGACY_COURSE_COLUMNS]: DbCourseRow[K] };

/** Fills in the columns `LEGACY_COURSE_COLUMNS` can't select, with the same defaults the DB migrations themselves use. */
function withLegacyCourseDefaults(row: LegacyCourseRow): DbCourseRow {
  return { ...row, primaryLocale: 'ht', bilingual: true, tags: null } as DbCourseRow;
}

/**
 * Every `courses` column EXCEPT `tags` (migration 0022) — the middle tier of
 * the read retry below. The live DB is expected to sit here for the window
 * between deploying this code and the owner running `npm run db:push`: it
 * HAS primary_locale/bilingual (their migration shipped long ago), only
 * `tags` is missing — so falling all the way back to `LEGACY_COURSE_COLUMNS`
 * would silently mislabel a monolingual course as bilingual. This projection
 * loses NOTHING but tags.
 */
const PRE_0022_COURSE_COLUMNS = {
  ...LEGACY_COURSE_COLUMNS,
  primaryLocale: T.courses.primaryLocale,
  bilingual: T.courses.bilingual,
} as const;

type Pre0022CourseRow = { [K in keyof typeof PRE_0022_COURSE_COLUMNS]: DbCourseRow[K] };

function withPre0022Defaults(row: Pre0022CourseRow): DbCourseRow {
  return { ...row, tags: null } as DbCourseRow;
}

/**
 * Every `courses` row. Tries every column first; retries with
 * `LEGACY_COURSE_COLUMNS` (see its doc comment) if that fails, and only
 * rethrows if the retry ALSO fails — callers already catch that (falling
 * back to static data / an empty list), same as before this task.
 */
export async function selectCourseRows(): Promise<DbCourseRow[]> {
  try {
    return await db.select().from(T.courses);
  } catch (err) {
    try {
      const rows = await db.select(PRE_0022_COURSE_COLUMNS).from(T.courses);
      console.warn('[courses/source] course read fell back to pre-0022 columns (missing tags) — run `npm run db:push`.');
      return rows.map(withPre0022Defaults);
    } catch {
      const rows = await db.select(LEGACY_COURSE_COLUMNS).from(T.courses);
      console.warn('[courses/source] course read fell back to pre-migration columns (missing primary_locale/bilingual) — run `npm run db:push`.');
      return rows.map(withLegacyCourseDefaults);
    }
  }
}

/** Same retry shape as `selectCourseRows`, scoped to one course by slug. */
export async function selectCourseRowBySlug(slug: string): Promise<DbCourseRow | undefined> {
  try {
    const [row] = await db.select().from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
    return row;
  } catch (err) {
    try {
      const [row] = await db.select(PRE_0022_COURSE_COLUMNS).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
      console.warn('[courses/source] course read fell back to pre-0022 columns (missing tags) — run `npm run db:push`.');
      return row ? withPre0022Defaults(row) : undefined;
    } catch {
      const [row] = await db.select(LEGACY_COURSE_COLUMNS).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
      console.warn('[courses/source] course read fell back to pre-migration columns (missing primary_locale/bilingual) — run `npm run db:push`.');
      return row ? withLegacyCourseDefaults(row) : undefined;
    }
  }
}

/** Same retry shape as `selectCourseRows`, scoped to one owner's courses (the teacher studio's course list). */
export async function selectCourseRowsByOwner(ownerUserId: string): Promise<DbCourseRow[]> {
  try {
    return await db.select().from(T.courses).where(eq(T.courses.ownerUserId, ownerUserId));
  } catch (err) {
    try {
      const rows = await db.select(PRE_0022_COURSE_COLUMNS).from(T.courses).where(eq(T.courses.ownerUserId, ownerUserId));
      console.warn('[courses/source] course read fell back to pre-0022 columns (missing tags) — run `npm run db:push`.');
      return rows.map(withPre0022Defaults);
    } catch {
      const rows = await db.select(LEGACY_COURSE_COLUMNS).from(T.courses).where(eq(T.courses.ownerUserId, ownerUserId));
      console.warn('[courses/source] course read fell back to pre-migration columns (missing primary_locale/bilingual) — run `npm run db:push`.');
      return rows.map(withLegacyCourseDefaults);
    }
  }
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
      selectCourseRows(),
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
 * Every course keyed by slug, DB-first with static fallback (same read as
 * `getAllCourses`) — for the `lib/admin/data/real/*.ts` modules that need an
 * O(1) title/lesson-count lookup by slug without importing the static
 * `data/courses.ts` catalog directly (Stage 7 fix: a DB-authored teacher
 * course has no entry in that static array at all, so resolving titles from
 * it made every such course show up as a raw slug — or, worse, silently
 * uncountable — across admin analytics/certificates/marketing/users/
 * engagement).
 */
export async function getCourseMap(): Promise<Map<string, Course>> {
  const all = await getAllCourses();
  return new Map(all.map((c) => [c.slug, c]));
}

/**
 * Only `status = 'published'` courses — what the public catalog/sales pages
 * show (Task C2-T3). With no DB (fallback), the static catalog IS today's
 * live/published set, so every static course is returned.
 */
/**
 * Teachers who are currently suspended — their work is NOT for sale.
 *
 * Suspension used to change one column on `teacher_profiles` and nothing
 * else: the suspended teacher's courses stayed in the catalogue, stayed
 * purchasable, and every sale kept crediting their earnings ledger. Suspending
 * someone for fraud left the money flowing to them.
 *
 * Enforced as a READ rule rather than by unpublishing their courses, for two
 * reasons: reactivating a teacher restores everything instantly with no
 * bookkeeping to get out of sync, and the teacher's own drafts and published
 * state stay exactly as they left them.
 *
 * GATED + NEVER-THROW: no DB or a failed query ⇒ an empty set, i.e. the
 * pre-existing behaviour. A read failure must not empty the whole catalogue.
 */
async function suspendedOwnerIds(): Promise<Set<string>> {
  if (!dbConfigured()) return new Set();
  try {
    const rows = await db
      .select({ userId: T.teacherProfiles.userId })
      .from(T.teacherProfiles)
      .where(eq(T.teacherProfiles.status, 'suspended'));
    return new Set(rows.map((r) => r.userId));
  } catch (err) {
    console.error('[courses/source] suspended-teacher read failed, treating none as suspended:', err);
    return new Set();
  }
}

/**
 * The catalogue as a BUYER sees it: published, and owned by a teacher in good
 * standing. Deliberately NOT used by the lesson player — a learner who already
 * paid keeps the access they bought even if that teacher is suspended later.
 */
/**
 * Pure — is this course row FOR SALE right now? Published, and owned by a
 * teacher who is not suspended. Exported so the rule can be tested without a
 * DB, and so both public reads below share one definition instead of two
 * filters that can drift.
 */
export function isSellableCourseRow(row: DbCourseRow, suspendedOwners: ReadonlySet<string>): boolean {
  if (row.status !== 'published') return false;
  return !(row.ownerUserId && suspendedOwners.has(row.ownerUserId));
}

export async function getPublishedCourses(): Promise<Course[]> {
  const rows = await readDbRows();
  if (!rows) return staticCourses;
  const suspended = await suspendedOwnerIds();
  return rows.courseRows
    .filter((r) => isSellableCourseRow(r, suspended))
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
  const row = rows.courseRows.find((r) => r.slug === slug);
  // A suspended teacher's course reads as "not published" here — and this is
  // what the sales page AND `resolveProduct` (both checkout routes) resolve
  // through, so it 404s and cannot be bought, without touching the course's
  // own status. See `suspendedOwnerIds` and `isSellableCourseRow`.
  if (!row || !isSellableCourseRow(row, await suspendedOwnerIds())) return undefined;
  return mapDbCourseToCourse(row, rows.lessonRows);
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
    // Task K3 — course-level links/downloads, rendered in the sales-page
    // description block. Mirrors the lesson-level `resources` above (K1);
    // no static counterpart, so the fallback path below never sets this.
    resources: row.resources ?? [],
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
