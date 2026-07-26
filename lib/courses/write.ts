/**
 * lib/courses/write.ts — the CMS's DB write layer (Task C2-T4), the
 * companion to lib/courses/source.ts's reads. Retires the in-memory content
 * store (lib/admin/content/{store,ops}.ts): the admin CMS now creates/edits/
 * publishes REAL `courses`/`lessons` rows, so an edit here is what the
 * public site (lib/courses/source.ts's `getPublishedCourses`/
 * `getPublishedCourseBySlug`/`getCourseDetail`) reads back.
 *
 * Also carries the CMS-only READS the admin pages need (`getAdminCourses`,
 * `getAdminCourse`, `getNextCourseCode`) — deliberately NOT in source.ts,
 * because that module's contract is the public `Course`/`CourseDetail`
 * shape filtered to what a visitor may see; the CMS needs every status
 * (draft/pending_review/published/…) and every raw field to edit.
 *
 * ENV-GATED, same choke point as source.ts: every exported function checks
 * `dbConfigured()` FIRST and returns `{ ok: false, message: 'db_required' }`
 * (reads: `null`/`[]`) instead of throwing when there's no DATABASE_URL —
 * the CMS pages/actions surface this as a clear, existing "error" state
 * rather than crashing (see lib/admin/content-actions.ts's `fail()`).
 * Until the owner runs `db:push` + `db:seed-courses`, the admin course list
 * is legitimately EMPTY and every write no-ops this way — expected, and
 * harmless, since the PUBLIC site keeps serving the 9 static courses via
 * source.ts's fallback the whole time (the two modules are independently
 * gated on the same env var, but reads never depend on writes having run).
 *
 * Unexpected DB errors are NOT caught here — they propagate to the calling
 * 'use server' action (lib/admin/content-actions.ts), which already wraps
 * every call in try/catch (the same division of labour as every other
 * lib/admin/data/real/*.ts module + its *-actions.ts caller).
 *
 * Status lifecycle: draft → pending_review → published (`submitForReview`
 * exists for this, but the current CMS UI has the owner publish directly —
 * the review QUEUE is C3 scope). `hasUnpublishedChanges` + revalidation:
 * there is no separate draft/live content fork — a single `courses` row
 * serves both the CMS and the public site — so an edit to an already
 * published course is technically already "live" the instant it's written;
 * `hasUnpublishedChanges` is an admin-facing reminder badge (mirrors the old
 * in-memory store's exact semantics), and `revalidatePath` (BUILD item 4) is
 * what makes that edit actually visible before the next ISR window.
 */
import { asc, eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@/db';
import { dbConfigured } from './source';
import { bootstrapEmails } from '@/lib/admin/access';
import { recordAudit } from '@/lib/admin/data/real/users';
import type { AdminActor } from '@/lib/admin/data/types';

const T = schema;

type DbCourseRow = typeof T.courses.$inferSelect;
type DbLessonRow = typeof T.lessons.$inferSelect;

/** The raw DB course status (draft/pending_review/published/rejected/archived)
 *  — exported for lib/teacher/studio.ts (Task C3-T4), which surfaces every
 *  status a teacher's own course can be in, unlike `AdminCourseStatus` above
 *  (narrowed to the binary the pre-C3 CMS UI understood). */
export type DbCourseStatus = DbCourseRow['status'];

export type CourseWriteResult = { ok: boolean; message?: string; slug?: string; count?: number };

function dbRequired(): CourseWriteResult {
  return { ok: false, message: 'db_required' };
}

/* -------------------------------------------------------------------------- */
/* Admin-facing types (mirror the retired ContentCourse/ContentLesson/…       */
/* field names so components/admin/content/*.tsx barely change) — `status`    */
/* now carries the REAL DB status (Task C3 fix: it used to collapse           */
/* pending_review/rejected/archived down to 'draft', which let PublishBar     */
/* render a one-click Publish button for a course still awaiting/failing      */
/* moderation — see `toAdminStatus` below). Identical to `rawStatus`/          */
/* `DbCourseStatus`; kept as its own alias so admin components can import a   */
/* name that describes intent without reaching into the DB row type.         */
/* -------------------------------------------------------------------------- */

export type AdminCourseStatus = DbCourseStatus;

export type AdminLesson = {
  id: string;
  title_ht: string;
  title_fr: string;
  /** Per-lesson description (Task C3-T4 — wires the C2 gap into the editors). */
  desc_ht: string;
  desc_fr: string;
  bunnyVideoId: string;
  durationSeconds: number;
  isPreview: boolean;
  sortOrder: number;
};

export type AdminFaq = { id: string; q_ht: string; q_fr: string; a_ht: string; a_fr: string };
export type AdminImage = { id: string; url: string; alt: string };

export type AdminCourse = {
  code: string;
  slug: string;
  icon: string;
  title_ht: string;
  title_fr: string;
  tagline_ht: string;
  tagline_fr: string;
  learn_ht: string[];
  learn_fr: string[];
  audience_ht: string;
  audience_fr: string;
  priceCents: number;
  status: AdminCourseStatus;
  hasUnpublishedChanges: boolean;
  /**
   * Identical to `status` above (Task C3-T4, mirrors `AdminCourseListRow`'s
   * fields of the same name) — kept as a separate field since call sites
   * across the CMS/studio already key off `rawStatus` by name; `status` no
   * longer collapses anything (see `toAdminStatus`), so the two are always
   * the same value today.
   */
  rawStatus: DbCourseStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  /** Sales-page difficulty level (Task C3-T4 — wires the C2 gap into the editors). */
  level_ht: string;
  level_fr: string;
  promise_ht: string;
  promise_fr: string;
  problem_ht: string;
  problem_fr: string;
  deliverables_ht: string[];
  deliverables_fr: string[];
  requirements_ht: string[];
  requirements_fr: string[];
  faq: AdminFaq[];
  lessons: AdminLesson[];
  mainImage: string | null;
  secondaryImages: AdminImage[];
};

export type AdminCourseListRow = {
  code: string;
  slug: string;
  title_ht: string;
  title_fr: string;
  priceCents: number;
  status: AdminCourseStatus;
  hasUnpublishedChanges: boolean;
  lessonsCount: number;
  /**
   * Identical to `status` above (Task C3-T3) — the `/admin/cours`
   * course-review queue tab keys off `rawStatus` by name to find
   * 'pending_review' rows and tell them apart from plain drafts/rejections.
   */
  rawStatus: DbCourseRow['status'];
  reviewNote: string | null;
  submittedAt: string | null;
};

/**
 * Task C3 fix: this used to collapse every non-'published' status
 * (pending_review/rejected/archived) down to 'draft' — harmless for the
 * pre-C3, single-owner CMS (nothing but draft/published ever existed), but
 * once teacher-submitted courses can sit in pending_review/rejected, it hid
 * that fact from `PublishBar`, which then rendered a one-click Publish
 * button for a course still awaiting (or having failed) moderation. Now a
 * pass-through — kept as a named seam (not inlined at the two call sites)
 * so a future admin-only status (e.g. a real 'archived' UI state) has one
 * place to special-case instead of two.
 */
export function toAdminStatus(status: DbCourseStatus): AdminCourseStatus {
  return status;
}

function mapRowToAdminCourse(row: DbCourseRow, lessonRows: DbLessonRow[]): AdminCourse {
  const lessons = lessonRows
    .filter((l) => l.courseSlug === row.slug)
    .sort((a, b) => a.index - b.index);

  const faqHt = row.faqHt ?? [];
  const faqFr = row.faqFr ?? [];
  const faq: AdminFaq[] = faqHt.map((f, i) => ({
    id: `faq_${i}`,
    q_ht: f.q,
    a_ht: f.a,
    q_fr: faqFr[i]?.q ?? '',
    a_fr: faqFr[i]?.a ?? '',
  }));

  const secondary = row.images?.secondary ?? [];

  return {
    code: row.code ?? row.slug,
    slug: row.slug,
    icon: row.icon ?? 'book',
    title_ht: row.titleHt ?? '',
    title_fr: row.titleFr ?? '',
    tagline_ht: row.taglineHt ?? '',
    tagline_fr: row.taglineFr ?? '',
    learn_ht: row.learnHt ?? [],
    learn_fr: row.learnFr ?? [],
    audience_ht: row.audienceHt ?? '',
    audience_fr: row.audienceFr ?? '',
    priceCents: row.priceCents ?? 0,
    status: toAdminStatus(row.status),
    hasUnpublishedChanges: row.hasUnpublishedChanges,
    rawStatus: row.status,
    reviewNote: row.reviewNote ?? null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    level_ht: row.levelHt ?? '',
    level_fr: row.levelFr ?? '',
    promise_ht: row.promiseHt ?? '',
    promise_fr: row.promiseFr ?? '',
    problem_ht: row.problemHt ?? '',
    problem_fr: row.problemFr ?? '',
    deliverables_ht: row.deliverablesHt ?? [],
    deliverables_fr: row.deliverablesFr ?? [],
    requirements_ht: row.prereqHt ?? [],
    requirements_fr: row.prereqFr ?? [],
    faq,
    lessons: lessons.map(
      (l): AdminLesson => ({
        id: l.id,
        title_ht: l.titleHt,
        title_fr: l.titleFr,
        desc_ht: l.descHt ?? '',
        desc_fr: l.descFr ?? '',
        bunnyVideoId: l.bunnyVideoId ?? '',
        durationSeconds: l.durationSeconds ?? 0,
        isPreview: l.isPreview,
        sortOrder: l.index,
      }),
    ),
    mainImage: row.images?.main ?? null,
    secondaryImages: secondary.map((s, i): AdminImage => ({ id: String(i), url: s.url, alt: s.alt ?? '' })),
  };
}

/* --------------------------------- reads ---------------------------------- */

/** Every course regardless of status — the /admin/cours list. `[]` with no live DB. */
export async function getAdminCourses(): Promise<AdminCourseListRow[]> {
  if (!dbConfigured()) return [];

  try {
    const [courseRows, lessonRows] = await Promise.all([
      db.select().from(T.courses),
      db.select({ courseSlug: T.lessons.courseSlug }).from(T.lessons),
    ]);
    const lessonCounts = new Map<string, number>();
    for (const l of lessonRows) lessonCounts.set(l.courseSlug, (lessonCounts.get(l.courseSlug) ?? 0) + 1);
    return courseRows.map((r) => ({
      code: r.code ?? r.slug,
      slug: r.slug,
      title_ht: r.titleHt ?? '',
      title_fr: r.titleFr ?? '',
      priceCents: r.priceCents ?? 0,
      status: toAdminStatus(r.status),
      hasUnpublishedChanges: r.hasUnpublishedChanges,
      lessonsCount: lessonCounts.get(r.slug) ?? 0,
      rawStatus: r.status,
      reviewNote: r.reviewNote ?? null,
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    }));
  } catch (err) {
    console.error('[courses/write] getAdminCourses DB read failed, gracefully degrading:', err);
    return [];
  }
}

/** One course (any status) + its lessons, full editable shape. `null` if missing / no live DB. */
export async function getAdminCourse(slug: string): Promise<AdminCourse | null> {
  if (!dbConfigured()) return null;

  try {
    const [row] = await db.select().from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
    if (!row) return null;
    const lessonRows = await db.select().from(T.lessons).where(eq(T.lessons.courseSlug, slug));
    return mapRowToAdminCourse(row, lessonRows);
  } catch (err) {
    console.error('[courses/write] getAdminCourse DB read failed, gracefully degrading:', err);
    return null;
  }
}

/** Next `PA-XX` code, incrementing the highest existing numeric suffix in the DB. */
export async function getNextCourseCode(): Promise<string> {
  if (!dbConfigured()) return 'PA-01';

  try {
    const rows = await db.select({ code: T.courses.code }).from(T.courses);
    const nums = rows
      .map((r) => Number((r.code ?? '').replace(/[^0-9]/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);
    const max = nums.length ? Math.max(...nums) : 0;
    return `PA-${String(max + 1).padStart(2, '0')}`;
  } catch (err) {
    console.error('[courses/write] getNextCourseCode DB read failed, gracefully degrading:', err);
    return 'PA-01';
  }
}

/* ------------------------------- helpers ---------------------------------- */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (accents) after NFD decomposition
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Resolves teacher #1 (the site owner)'s `users.id` for `courses.owner_user_id`
 * — same rule as scripts/seed-courses.ts (ADMIN_BOOTSTRAP_EMAILS match, else
 * the sole `users` row) but NEVER throws: an admin course-creation click must
 * degrade to an ownerless (nullable) row, not fail, when ambiguous/empty.
 */
async function resolveOwnerUserId(): Promise<string | null> {
  const emails = bootstrapEmails();
  const allUsers = await db.select({ id: T.users.id, email: T.users.email }).from(T.users);
  if (emails.length > 0) {
    const match = allUsers.find((u) => emails.includes(u.email.toLowerCase()));
    if (match) return match.id;
  }
  if (allUsers.length === 1) return allUsers[0].id;
  return null;
}

/**
 * Public routes affected by a course's content/publish state (both locales).
 * Exported for lib/teacher/studio-actions.ts (Task C3-T4 fix): the studio's
 * re-review gate (a published course an owning teacher edits drops back to
 * `pending_review`, see that file) needs to revalidate the same public paths
 * this module's own status-changing writes do, without duplicating the
 * locale/path list here.
 */
export function revalidateCoursePaths(slug: string): void {
  for (const locale of ['ht', 'fr'] as const) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/formations`);
    revalidatePath(`/${locale}/formations/${slug}`);
  }
}

/**
 * Shared by every lesson/image mutation (course-field edits inline their own
 * flag+revalidate in the same statement — see `updateCourse`): if the course
 * is currently published, flag it dirty and revalidate immediately (see file
 * header — there's no separate draft/live fork).
 */
async function markDirtyAndRevalidateIfPublished(slug: string): Promise<void> {
  const [course] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (course?.status !== 'published') return;
  await db.update(T.courses).set({ hasUnpublishedChanges: true, updatedAt: new Date() }).where(eq(T.courses.slug, slug));
  revalidateCoursePaths(slug);
}

/* -------------------------------- course ----------------------------------- */

export type NewCourseInput = {
  code?: string;
  slug?: string;
  title_ht: string;
  title_fr: string;
  icon?: string;
  priceCents?: number;
};

/**
 * `ownerUserIdOverride`: Task C3-T4's teacher studio creates a course owned
 * by the SIGNED-IN teacher, not the site owner `resolveOwnerUserId()` would
 * resolve — pass the teacher's `users.id` explicitly (see
 * lib/teacher/studio-actions.ts's `createMyCourseAction`). `undefined` (the
 * admin CMS's call site, unchanged) keeps the original `resolveOwnerUserId()`
 * behaviour; `null` would deliberately create an ownerless row (unused today).
 */
export async function createCourse(
  input: NewCourseInput,
  actor: AdminActor,
  ownerUserIdOverride?: string | null,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();

  const code = input.code?.trim() || (await getNextCourseCode());
  let slug = input.slug?.trim() || slugify(input.title_fr || input.title_ht) || `course-${Date.now()}`;

  // Check-then-insert (no transaction support on the neon-http driver — see
  // db/index.ts): acceptable here, this is a single-admin, low-traffic path,
  // and `courses.slug` is UNIQUE at the DB level as a backstop regardless.
  const existingSlugs = new Set((await db.select({ slug: T.courses.slug }).from(T.courses)).map((r) => r.slug));
  if (existingSlugs.has(slug)) {
    let i = 2;
    while (existingSlugs.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }

  const ownerUserId = ownerUserIdOverride !== undefined ? ownerUserIdOverride : await resolveOwnerUserId();

  await db.insert(T.courses).values({
    ownerUserId: ownerUserId ?? null,
    slug,
    code,
    icon: input.icon || 'book',
    titleHt: input.title_ht,
    titleFr: input.title_fr,
    priceCents: input.priceCents ?? 0,
    currency: 'USD',
    status: 'draft',
    hasUnpublishedChanges: false,
  });

  await recordAudit({ action: 'create_course', userId: actor.id, admin: actor, detail: slug });
  return { ok: true, slug };
}

/** Editable general + sales-page fields (code/slug/status/lessons/images managed separately). */
export type CoursePatch = Partial<{
  icon: string;
  title_ht: string;
  title_fr: string;
  tagline_ht: string;
  tagline_fr: string;
  audience_ht: string;
  audience_fr: string;
  learn_ht: string[];
  learn_fr: string[];
  priceCents: number;
  promise_ht: string;
  promise_fr: string;
  problem_ht: string;
  problem_fr: string;
  deliverables_ht: string[];
  deliverables_fr: string[];
  requirements_ht: string[];
  requirements_fr: string[];
  faq: AdminFaq[];
  level_ht: string;
  level_fr: string;
}>;

export async function updateCourse(slug: string, patch: CoursePatch, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };

  const set: Partial<typeof T.courses.$inferInsert> = { updatedAt: new Date() };
  if (patch.icon !== undefined) set.icon = patch.icon;
  if (patch.title_ht !== undefined) set.titleHt = patch.title_ht;
  if (patch.title_fr !== undefined) set.titleFr = patch.title_fr;
  if (patch.tagline_ht !== undefined) set.taglineHt = patch.tagline_ht;
  if (patch.tagline_fr !== undefined) set.taglineFr = patch.tagline_fr;
  if (patch.audience_ht !== undefined) set.audienceHt = patch.audience_ht;
  if (patch.audience_fr !== undefined) set.audienceFr = patch.audience_fr;
  if (patch.learn_ht !== undefined) set.learnHt = patch.learn_ht;
  if (patch.learn_fr !== undefined) set.learnFr = patch.learn_fr;
  if (patch.priceCents !== undefined) set.priceCents = patch.priceCents;
  if (patch.promise_ht !== undefined) set.promiseHt = patch.promise_ht;
  if (patch.promise_fr !== undefined) set.promiseFr = patch.promise_fr;
  if (patch.problem_ht !== undefined) set.problemHt = patch.problem_ht;
  if (patch.problem_fr !== undefined) set.problemFr = patch.problem_fr;
  if (patch.deliverables_ht !== undefined) set.deliverablesHt = patch.deliverables_ht;
  if (patch.deliverables_fr !== undefined) set.deliverablesFr = patch.deliverables_fr;
  if (patch.requirements_ht !== undefined) set.prereqHt = patch.requirements_ht;
  if (patch.requirements_fr !== undefined) set.prereqFr = patch.requirements_fr;
  if (patch.level_ht !== undefined) set.levelHt = patch.level_ht;
  if (patch.level_fr !== undefined) set.levelFr = patch.level_fr;
  if (patch.faq !== undefined) {
    set.faqHt = patch.faq.map((f) => ({ q: f.q_ht, a: f.a_ht }));
    set.faqFr = patch.faq.map((f) => ({ q: f.q_fr, a: f.a_fr }));
  }

  const wasPublished = current.status === 'published';
  if (wasPublished) set.hasUnpublishedChanges = true;

  await db.update(T.courses).set(set).where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'update_course', userId: actor.id, admin: actor, detail: slug });
  if (wasPublished) revalidateCoursePaths(slug);
  return { ok: true };
}

export async function submitForReview(slug: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  await db
    .update(T.courses)
    .set({ status: 'pending_review', submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'submit_course_review', userId: actor.id, admin: actor, detail: slug });
  return { ok: true };
}

/**
 * Task C3 fix: requires `current.status === 'draft'` — this is the
 * generic, courses.edit-gated CMS path (any editeur-contenu can reach it),
 * NOT the moderation queue. Before this guard, it could publish a
 * pending_review/rejected/already-published course directly, completely
 * bypassing `teachers.review`'s approve/reject step and the studio's
 * re-review-on-edit gate (`reenterReviewIfWasPublished`) — a teacher's
 * course pulled back into pending_review for re-review could be pushed
 * live again by anyone with mere content-edit rights. A pending_review
 * course must go through `approveCourse` (teachers.review-gated); a
 * rejected one must be resubmitted (teacher's studio) then approved; an
 * already-published one has nothing to "publish" — see `unpublishCourse`.
 */
export async function publishCourse(slug: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'draft') return { ok: false, message: 'invalid_status' };
  const now = new Date();
  await db
    .update(T.courses)
    .set({ status: 'published', hasUnpublishedChanges: false, publishedAt: now, updatedAt: now })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'publish_course', userId: actor.id, admin: actor, detail: slug });
  revalidateCoursePaths(slug);
  return { ok: true };
}

/**
 * Admin course-review queue (Task C3-T3): approve a `pending_review` course
 * → 'published' (same public-facing effect as `publishCourse`, plus it
 * records the reviewing admin — `reviewedBy` — which the direct-publish path
 * above has no reason to set since the owner publishes their own course
 * there). Requires `current.status === 'pending_review'`.
 */
export async function approveCourse(slug: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending_review') return { ok: false, message: 'invalid_status' };
  const now = new Date();
  await db
    .update(T.courses)
    .set({ status: 'published', hasUnpublishedChanges: false, publishedAt: now, reviewedBy: actor.id, updatedAt: now })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'approve_course', userId: actor.id, admin: actor, detail: slug });
  revalidateCoursePaths(slug);
  return { ok: true };
}

/** Admin course-review queue (Task C3-T3): reject a submitted course with a required note. Requires `current.status === 'pending_review'`. */
export async function rejectCourse(slug: string, note: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending_review') return { ok: false, message: 'invalid_status' };
  await db
    .update(T.courses)
    .set({ status: 'rejected', reviewNote: note, reviewedBy: actor.id, updatedAt: new Date() })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'reject_course', userId: actor.id, admin: actor, detail: slug, reason: note });
  revalidateCoursePaths(slug);
  return { ok: true };
}

export async function unpublishCourse(slug: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  await db
    .update(T.courses)
    .set({ status: 'draft', hasUnpublishedChanges: false, updatedAt: new Date() })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'unpublish_course', userId: actor.id, admin: actor, detail: slug });
  revalidateCoursePaths(slug);
  return { ok: true };
}

/** Blocked if the course has any enrollment (real `enrollments` table — the money path). */
export async function deleteCourse(slug: string, confirmCode: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select().from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };

  const enrollRows = await db.select({ id: T.enrollments.id }).from(T.enrollments).where(eq(T.enrollments.courseSlug, slug));
  if (enrollRows.length > 0) return { ok: false, message: 'has_enrollments', count: enrollRows.length };

  if (confirmCode.trim().toUpperCase() !== (current.code ?? '').toUpperCase()) {
    return { ok: false, message: 'code_mismatch' };
  }

  const wasPublished = current.status === 'published';
  await db.delete(T.courses).where(eq(T.courses.slug, slug)); // cascades to `lessons` (FK onDelete: cascade)
  await recordAudit({ action: 'delete_course', userId: actor.id, admin: actor, detail: slug });
  if (wasPublished) revalidateCoursePaths(slug);
  return { ok: true };
}

/* ------------------------------- lessons ----------------------------------- */

export async function addLesson(slug: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [course] = await db.select({ slug: T.courses.slug }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!course) return { ok: false, message: 'not_found' };

  const rows = await db.select({ index: T.lessons.index }).from(T.lessons).where(eq(T.lessons.courseSlug, slug));
  const nextIndex = rows.length ? Math.max(...rows.map((r) => r.index)) + 1 : 1;

  await db.insert(T.lessons).values({ courseSlug: slug, index: nextIndex, titleHt: '', titleFr: '', isPreview: false });
  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'add_lesson', userId: actor.id, admin: actor, detail: slug });
  return { ok: true };
}

export type LessonPatch = Partial<{
  title_ht: string;
  title_fr: string;
  /** Per-lesson description (Task C3-T4 — wires the C2 gap into the editors). */
  desc_ht: string;
  desc_fr: string;
  bunnyVideoId: string;
  durationSeconds: number;
  isPreview: boolean;
}>;

export async function updateLesson(
  slug: string,
  lessonId: string,
  patch: LessonPatch,
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const set: Partial<typeof T.lessons.$inferInsert> = { updatedAt: new Date() };
  if (patch.title_ht !== undefined) set.titleHt = patch.title_ht;
  if (patch.title_fr !== undefined) set.titleFr = patch.title_fr;
  if (patch.desc_ht !== undefined) set.descHt = patch.desc_ht;
  if (patch.desc_fr !== undefined) set.descFr = patch.desc_fr;
  if (patch.bunnyVideoId !== undefined) set.bunnyVideoId = patch.bunnyVideoId || null;
  if (patch.durationSeconds !== undefined) set.durationSeconds = patch.durationSeconds;
  if (patch.isPreview !== undefined) set.isPreview = patch.isPreview;

  const res = await db
    .update(T.lessons)
    .set(set)
    .where(and(eq(T.lessons.courseSlug, slug), eq(T.lessons.id, lessonId)))
    .returning({ id: T.lessons.id });
  if (res.length === 0) return { ok: false, message: 'not_found' };

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'update_lesson', userId: actor.id, admin: actor, detail: `${slug}#${lessonId}` });
  return { ok: true };
}

export async function deleteLesson(slug: string, lessonId: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const res = await db
    .delete(T.lessons)
    .where(and(eq(T.lessons.courseSlug, slug), eq(T.lessons.id, lessonId)))
    .returning({ id: T.lessons.id });
  if (res.length === 0) return { ok: false, message: 'not_found' };

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'delete_lesson', userId: actor.id, admin: actor, detail: `${slug}#${lessonId}` });
  return { ok: true };
}

/**
 * Swaps a lesson with its adjacent-in-order neighbour. `lessons` has a
 * unique(course_slug, index) constraint, so a naive 2-statement swap can
 * transiently give two rows the same index within the same command (Postgres
 * checks a non-deferred unique constraint per row as it applies each
 * update) — the 3rd write through a scratch sentinel index (`-1`, never a
 * valid lesson position) avoids that collision. No transaction wraps this
 * (the neon-http driver doesn't support one — see db/index.ts): a failure
 * between steps would leave one lesson at `-1`, self-healing on the next
 * successful reorder of that same lesson, and never surfaced publicly since
 * `lib/courses/source.ts` always re-sorts by `index` before returning an
 * array (a temporarily-out-of-range value only affects relative order, it's
 * never rendered).
 */
export async function reorderLessons(
  slug: string,
  lessonId: string,
  dir: 'up' | 'down',
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const rows = await db.select().from(T.lessons).where(eq(T.lessons.courseSlug, slug)).orderBy(asc(T.lessons.index));
  const i = rows.findIndex((r) => r.id === lessonId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return { ok: false, message: 'invalid_move' };

  const a = rows[i];
  const b = rows[j];
  const now = new Date();
  await db.update(T.lessons).set({ index: -1, updatedAt: now }).where(eq(T.lessons.id, a.id));
  await db.update(T.lessons).set({ index: a.index, updatedAt: now }).where(eq(T.lessons.id, b.id));
  await db.update(T.lessons).set({ index: b.index, updatedAt: now }).where(eq(T.lessons.id, a.id));

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'reorder_lesson', userId: actor.id, admin: actor, detail: `${slug}#${lessonId}:${dir}` });
  return { ok: true };
}

/* -------------------------------- images ------------------------------------ */

/**
 * Full replace of a course's image set (main + secondary, each `{url, alt}`).
 * The four granular admin actions (set main / add / remove / move secondary,
 * lib/admin/content-actions.ts) each read the course's current images,
 * compute the new array in JS, and call this — same "read, mutate in
 * memory, write back whole" shape the retired in-memory store used, just
 * against a real row now. No stable id is persisted per secondary image
 * (jsonb array, not its own table); the admin UI keys/targets them by
 * position, which is always freshly re-read after each mutation
 * (`router.refresh()`), so this is safe.
 */
export async function setCourseImages(
  slug: string,
  images: { main: string | null; secondary: { url: string; alt: string }[] },
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };

  const set: Partial<typeof T.courses.$inferInsert> = {
    images: { main: images.main ?? undefined, secondary: images.secondary },
    updatedAt: new Date(),
  };
  const wasPublished = current.status === 'published';
  if (wasPublished) set.hasUnpublishedChanges = true;

  await db.update(T.courses).set(set).where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'update_course_images', userId: actor.id, admin: actor, detail: slug });
  if (wasPublished) revalidateCoursePaths(slug);
  return { ok: true };
}
