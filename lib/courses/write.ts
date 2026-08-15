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
import { asc, eq, and, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, schema, isMissingColumnError } from '@/db';
import { coursesPre0022 } from '@/db/courses-compat';
import { COURSE_CATEGORIES } from '@/data/courses';
import { sanitizeTags } from './tags';
import { dbConfigured, selectCourseRows, selectCourseRowBySlug } from './source';
import { bootstrapEmails } from '@/lib/admin/access';
import { recordAudit } from '@/lib/admin/data/real/users';
import { sendEmail } from '@/lib/email/resend';
import { buildCourseApprovedHtml, buildCourseRejectedHtml } from '@/lib/email/templates';
import { SITE_URL } from '@/lib/email/layout';
import type { AdminActor } from '@/lib/admin/data/types';
import { isValidHttpUrl } from '@/lib/teacher/apply-validation';
import type { CourseResource } from '@/db/schema';
import { deleteBunnyVideo, bunnyUploadConfigured } from '@/lib/bunny/upload';
import { computeCourseReadiness } from './readiness';

const T = schema;

type DbCourseRow = typeof T.courses.$inferSelect;
type DbLessonRow = typeof T.lessons.$inferSelect;
export type DbChapterRow = typeof T.courseChapters.$inferSelect;

/** The raw DB course status (draft/pending_review/published/rejected/archived)
 *  — exported for lib/teacher/studio.ts (Task C3-T4), which surfaces every
 *  status a teacher's own course can be in, unlike `AdminCourseStatus` above
 *  (narrowed to the binary the pre-C3 CMS UI understood). */
export type DbCourseStatus = DbCourseRow['status'];

export type CourseWriteResult = {
  ok: boolean;
  message?: string;
  slug?: string;
  count?: number;
  /** The created row's id (Task K2 — `addLesson` only): lets a caller that
   *  just added a lesson immediately place it into a chapter via a second
   *  `moveLessonToChapter` call, without a separate lookup. */
  lessonId?: string;
};

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
  /** Task K2 (plan de cours complet) — which chapter this lesson belongs to,
   *  `null` = "hors chapitre" (ungrouped). Mirrors `lessons.chapter_id`. */
  chapterId: string | null;
  /** Long-form teacher notes shown under the video (Task K2) — distinct from desc_ht/fr. */
  notes_ht: string;
  notes_fr: string;
  /** Links/downloads attached to the lesson (Task K2) — validated on write, see `validateResources`. */
  resources: CourseResource[];
};

export type AdminFaq = { id: string; q_ht: string; q_fr: string; a_ht: string; a_fr: string };
export type AdminImage = { id: string; url: string; alt: string };

/**
 * A course's part/module (Task K2 — plan de cours complet), the CMS-facing
 * shape of a `course_chapters` row. `sortOrder` mirrors `AdminLesson`'s field
 * of the same name (both are just the row's `index` column, pre-sorted by
 * `mapRowToAdminCourse` — exposed so the plan editor can enable/disable its
 * up/down buttons without re-deriving order from array position alone).
 */
export type AdminChapter = {
  id: string;
  title_ht: string;
  title_fr: string;
  summary_ht: string;
  summary_fr: string;
  sortOrder: number;
};

export type AdminCourse = {
  code: string;
  slug: string;
  icon: string;
  /** Catalogue shelf (one of data/courses.ts's COURSE_CATEGORIES) — editable
   *  by the teacher since « tags + catégories » (août 2026); `null` on rows
   *  seeded before the picker existed (public mapper shows 'lavi-pratik'). */
  category: 'biznis' | 'dijital' | 'lajan' | 'lavi-pratik' | null;
  /** Teacher-chosen free tags — canonical shape lib/courses/tags.ts. */
  tags: string[];
  /**
   * Optional course translation (Task: course-language). `bilingual=false`
   * means the editor shows a SINGLE input per ht/fr field group (the
   * `primary_locale` one) instead of the pair, and every save mirrors that
   * single value into both DB columns (`mirrorBilingualFields`, the ONE
   * place this is enforced) — see db/schema.ts's `courses.bilingual` doc
   * comment for the full design.
   */
  bilingual: boolean;
  primary_locale: 'ht' | 'fr';
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
  /** A course's parts/modules (Task K2), ordered by `sortOrder` — `[]` for
   *  every course until a teacher/admin adds one (the flat, pre-K2 shape). */
  chapters: AdminChapter[];
  /** Course-level links/downloads (Task K2), rendered in the sales-page
   *  description block ("lien en description"). Mirrors `courses.resources`. */
  resources: CourseResource[];
  mainImage: string | null;
  secondaryImages: AdminImage[];
  /** Nullable — the course's owning teacher (`users.id`). Used to resolve a
   *  display name for automatic Bunny collection naming (see
   *  lib/bunny/organize.ts); `null` for an ownerless row. */
  ownerUserId: string | null;
  /** The Bunny Stream Collection guid grouping this course's videos
   *  (automatic Bunny organization) — `null` until the first lesson video
   *  upload for this course creates one. See lib/bunny/collections.ts. */
  bunnyCollectionId: string | null;
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
  /** Nullable — the course's owning teacher (`users.id`), Task
   *  feat/separate-authoring: `/admin/cours` resolves this to a display name
   *  (lib/teacher/admin.ts's `getOwnerDisplayNames`) so the oversight list
   *  shows whose course it is, now that authoring itself lives in the
   *  teacher studio, not the platform admin. */
  ownerUserId: string | null;
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

function mapRowToAdminCourse(
  row: DbCourseRow,
  lessonRows: DbLessonRow[],
  chapterRows: DbChapterRow[] = [],
): AdminCourse {
  const lessons = lessonRows
    .filter((l) => l.courseSlug === row.slug)
    .sort((a, b) => a.index - b.index);

  const chapters: AdminChapter[] = [...chapterRows]
    .sort((a, b) => a.index - b.index)
    .map((c) => ({
      id: c.id,
      title_ht: c.titleHt,
      title_fr: c.titleFr,
      summary_ht: c.summaryHt ?? '',
      summary_fr: c.summaryFr ?? '',
      sortOrder: c.index,
    }));

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
    category: row.category ?? null,
    tags: row.tags ?? [],
    bilingual: row.bilingual ?? true,
    primary_locale: row.primaryLocale ?? 'ht',
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
        chapterId: l.chapterId ?? null,
        notes_ht: l.notesHt ?? '',
        notes_fr: l.notesFr ?? '',
        resources: l.resources ?? [],
      }),
    ),
    chapters,
    resources: row.resources ?? [],
    mainImage: row.images?.main ?? null,
    secondaryImages: secondary.map((s, i): AdminImage => ({ id: String(i), url: s.url, alt: s.alt ?? '' })),
    ownerUserId: row.ownerUserId ?? null,
    bunnyCollectionId: row.bunnyCollectionId ?? null,
  };
}

/* --------------------------------- reads ---------------------------------- */

/**
 * Count of `courses` rows with `status = 'pending_review'` — Stage 7's
 * sidebar badge for the "À valider" review queue (mirrors
 * `lib/teacher/admin.ts`'s `countTeacherProfilesByStatus` / `lib/teacher/
 * payouts.ts`'s `countWithdrawalsByStatus`: a lightweight count, no full row
 * load). GATED + FALLBACK: no DATABASE_URL or a failed query ⇒ 0, never
 * throws.
 */
export async function countCoursesPendingReview(): Promise<number> {
  if (!dbConfigured()) return 0;
  try {
    const rows = await selectCourseRows();
    return rows.filter((r) => r.status === 'pending_review').length;
  } catch (err) {
    console.error('[courses/write] countCoursesPendingReview DB read failed, falling back to 0:', err);
    return 0;
  }
}

/** Every course regardless of status — the /admin/cours list. `[]` with no live DB. */
export async function getAdminCourses(): Promise<AdminCourseListRow[]> {
  if (!dbConfigured()) return [];

  try {
    const [courseRows, lessonRows] = await Promise.all([
      selectCourseRows(),
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
      ownerUserId: r.ownerUserId ?? null,
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
    const row = await selectCourseRowBySlug(slug);
    if (!row) return null;
    const [lessonRows, chapterRows] = await Promise.all([
      db.select().from(T.lessons).where(eq(T.lessons.courseSlug, slug)),
      db.select().from(T.courseChapters).where(eq(T.courseChapters.courseSlug, slug)),
    ]);
    return mapRowToAdminCourse(row, lessonRows, chapterRows);
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

/* --------------------------- resource validation --------------------------- */

/**
 * Task K1 (plan de cours complet): a lesson/course `resources` entry is
 * self-serve teacher input reaching a public render (link/download list) —
 * every field is validated at WRITE time, mirroring
 * lib/teacher/public.ts's `isSafePhotoUrl` allowlist (same `isValidHttpUrl`
 * rule, reused rather than duplicated — see that module's own doc comment on
 * why the write-time and render-time rule must never drift apart).
 */
export const RESOURCE_LABEL_MAX_LENGTH = 120;

/** First failing reason code for one resource, or `null` if acceptable. Exported for unit testing. */
export function validateResource(r: CourseResource): string | null {
  const labelHt = r.label_ht?.trim() ?? '';
  const labelFr = r.label_fr?.trim() ?? '';
  if (!labelHt) return 'resource_label_ht_required';
  if (!labelFr) return 'resource_label_fr_required';
  if (labelHt.length > RESOURCE_LABEL_MAX_LENGTH) return 'resource_label_ht_too_long';
  if (labelFr.length > RESOURCE_LABEL_MAX_LENGTH) return 'resource_label_fr_too_long';
  if (r.kind !== 'link' && r.kind !== 'file') return 'resource_kind_invalid';
  if (!isValidHttpUrl(r.url ?? '')) return 'resource_url_invalid';
  return null;
}

/**
 * First failing reason code across the whole list, or `null` if every entry
 * is acceptable — callers (`updateLesson`/`updateCourse`) REJECT the whole
 * write with this message rather than silently dropping the bad entry.
 * Exported for unit testing.
 */
export function validateResources(resources: CourseResource[]): string | null {
  for (const r of resources) {
    const err = validateResource(r);
    if (err) return err;
  }
  return null;
}

/** Trims every string field — applied only after `validateResources` passes. */
function normalizeResource(r: CourseResource): CourseResource {
  return { label_ht: r.label_ht.trim(), label_fr: r.label_fr.trim(), url: r.url.trim(), kind: r.kind };
}

export type PreparedResources = { ok: true; resources: CourseResource[] } | { ok: false; message: string };

/**
 * THE shared resource path (Stage 4 — documents/ressources) that BOTH
 * `updateCourse` and `updateLesson` traverse when a patch carries
 * `resources`. Resources were the ONE bilingual exception left after Task:
 * course/lesson/chapter-language: `validateResource` hard-requires BOTH
 * labels, so a monolingual kreyòl course was still forced to type a French
 * title for every link. Same cure as everywhere else — mirror the PRIMARY
 * locale's label into the other side (byte-identical, the exact invariant
 * `mirrorBilingualFields` maintains for column pairs — resources just live
 * INSIDE one jsonb column, so the mirroring happens per-row here instead of
 * per-column there), THEN validate:
 *
 *  - monolingual (`bilingual === false`): the missing/stale other-side label
 *    is overwritten with the primary one, so a row typed once passes the
 *    unchanged strict validation — and a visitor browsing in the other
 *    locale still sees a real label. An EMPTY primary label still fails
 *    (mirroring '' into '' trips `resource_label_*_required`) — mono never
 *    weakens the "every row needs a title" rule, only the "in two languages"
 *    part.
 *  - bilingual: pass-through — the strict both-labels validation is
 *    untouched.
 *
 * Pure + exported for unit testing (lib/courses/write.resources.test.ts)
 * without a DB, like every other decision helper in this module.
 */
export function prepareResourcesForWrite(
  resources: CourseResource[],
  bilingual: boolean,
  primaryLocale: 'ht' | 'fr',
): PreparedResources {
  const mirrored = bilingual
    ? resources
    : resources.map((r) => (primaryLocale === 'ht' ? { ...r, label_fr: r.label_ht } : { ...r, label_ht: r.label_fr }));
  const err = validateResources(mirrored);
  if (err) return { ok: false, message: err };
  return { ok: true, resources: mirrored.map(normalizeResource) };
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

/**
 * Every `courses` ht/fr column pair (Task: course-language) — the owner's
 * own list: "title_ht/title_fr, tagline, audience, learn, level, promise,
 * problem, deliverables, prereq, faq". Shared by `mirrorBilingualFields`
 * below; exported so it can be unit-tested against the exact list this
 * module writes with, without re-deriving it.
 */
export const COURSE_BILINGUAL_PAIR_COLUMNS: readonly (readonly [string, string])[] = [
  ['titleHt', 'titleFr'],
  ['taglineHt', 'taglineFr'],
  ['audienceHt', 'audienceFr'],
  ['learnHt', 'learnFr'],
  ['levelHt', 'levelFr'],
  ['promiseHt', 'promiseFr'],
  ['problemHt', 'problemFr'],
  ['deliverablesHt', 'deliverablesFr'],
  ['prereqHt', 'prereqFr'],
  ['faqHt', 'faqFr'],
];

/**
 * THE ONE PLACE (Task: course-language — see db/schema.ts's `courses.
 * bilingual` doc comment for the full design; extended by Task:
 * lesson-language to also mirror a LESSON's title/desc/notes pairs, via
 * `LESSON_BILINGUAL_PAIR_COLUMNS` below — same invariant, same function,
 * just a different column-pair list): when a course is monolingual
 * (`bilingual === false`), every ht/fr column pair above must carry
 * byte-identical content, so every existing reader (public pages, cards,
 * emails, Bunny titles, seed, ManifestList…) keeps working untouched and a
 * visitor browsing in the "other" locale still sees the course instead of
 * blanks. `createCourse` and `updateCourse` funnel their insert-values/`set`
 * object through this for `COURSE_BILINGUAL_PAIR_COLUMNS`; `updateLesson`
 * does the same for `LESSON_BILINGUAL_PAIR_COLUMNS` — every write to either
 * table goes through THIS function, right before the DB call, so no
 * caller/field can forget to mirror.
 *
 * Copies FROM the `primaryLocale` side TO the other side, and ONLY for a
 * pair actually present in `values` this call (`undefined` means "not being
 * written right now" — leaves it alone, since it was already mirrored by a
 * previous save under the same invariant). A no-op when `bilingual` is true.
 * Generic + structural (works on `createCourse`'s full insert-values object,
 * `updateCourse`'s partial `set` object, and `updateLesson`'s partial `set`
 * object) so it's usable — and unit-testable — without a DB connection.
 *
 * `pairColumns` defaults to `COURSE_BILINGUAL_PAIR_COLUMNS` (every existing
 * call site is unchanged); pass `LESSON_BILINGUAL_PAIR_COLUMNS` for a lesson.
 */
export function mirrorBilingualFields<T extends Record<string, unknown>>(
  values: T,
  bilingual: boolean,
  primaryLocale: 'ht' | 'fr',
  pairColumns: readonly (readonly [string, string])[] = COURSE_BILINGUAL_PAIR_COLUMNS,
): T {
  if (bilingual) return values;
  const out: Record<string, unknown> = { ...values };
  for (const [htKey, frKey] of pairColumns) {
    const primaryKey = primaryLocale === 'ht' ? htKey : frKey;
    const otherKey = primaryLocale === 'ht' ? frKey : htKey;
    if (out[primaryKey] !== undefined) out[otherKey] = out[primaryKey];
  }
  return out as T;
}

/** `primaryLocale` must be 'ht' or 'fr' — guards a studio/CMS call site that bypasses the TS type (raw form data, tampered request). */
function isValidLocale(v: unknown): v is 'ht' | 'fr' {
  return v === 'ht' || v === 'fr';
}

export type NewCourseInput = {
  code?: string;
  slug?: string;
  title_ht: string;
  title_fr: string;
  icon?: string;
  priceCents?: number;
  /**
   * Optional course translation (Task: course-language). Both optional —
   * a call site that omits them creates a bilingual, ht-primary course
   * exactly like before this task. `bilingual: false` requires a real
   * `primaryLocale` (validated, defaults to 'ht' if omitted) — see
   * `mirrorBilingualFields`.
   */
  bilingual?: boolean;
  primaryLocale?: 'ht' | 'fr';
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

  const bilingual = input.bilingual ?? true;
  if (input.primaryLocale !== undefined && !isValidLocale(input.primaryLocale)) {
    return { ok: false, message: 'invalid_primary_locale' };
  }
  const primaryLocale: 'ht' | 'fr' = input.primaryLocale ?? 'ht';

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

  // Monolingual creation (Task: course-language): the studio's "nouveau
  // cours" form collects only ONE title when `bilingual` is false — the
  // caller (createMyCourseAction) fills the non-primary `title_ht`/
  // `title_fr` with a placeholder (or leaves it equal), and
  // `mirrorBilingualFields` below overwrites it with the primary value
  // regardless, so the row is correct either way.
  const values = mirrorBilingualFields(
    {
      ownerUserId: ownerUserId ?? null,
      slug,
      code,
      icon: input.icon || 'book',
      titleHt: input.title_ht,
      titleFr: input.title_fr,
      priceCents: input.priceCents ?? 0,
      currency: 'USD',
      status: 'draft' as const,
      hasUnpublishedChanges: false,
      bilingual,
      primaryLocale,
    },
    bilingual,
    primaryLocale,
  );

  try {
    await db.insert(T.courses).values(values);
  } catch (err) {
    // Pre-0022 window: drizzle names EVERY schema column in an INSERT (tags
    // included, as `default`), so course creation would 42703 on a live DB
    // the owner hasn't `db:push`ed yet. Retry through the twin table that
    // predates the column (db/courses-compat.ts) — same proven pattern as
    // the checkout routes' `checkoutSessionsPre0021`.
    if (!isMissingColumnError(err)) throw err;
    await db.insert(coursesPre0022).values(values);
    console.warn('[courses/write] create fell back to pre-0022 insert (missing tags) — run `npm run db:push`.');
  }

  await recordAudit({ action: 'create_course', userId: actor.id, admin: actor, detail: slug });
  return { ok: true, slug };
}

/** Editable general + sales-page fields (code/slug/status/lessons/images managed separately). */
export type CoursePatch = Partial<{
  icon: string;
  /** Catalogue shelf — validated against COURSE_CATEGORIES at save time. */
  category: 'biznis' | 'dijital' | 'lajan' | 'lavi-pratik';
  /** Free tags — passed through `sanitizeTags`, never stored raw. */
  tags: string[];
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
  /** Course-level links/downloads (Task K1) — validated, see `validateResources`. */
  resources: CourseResource[];
  /** Optional course translation (Task: course-language) — see `NewCourseInput`'s doc comment + `mirrorBilingualFields`. */
  bilingual: boolean;
  primaryLocale: 'ht' | 'fr';
}>;

export async function updateCourse(slug: string, patch: CoursePatch, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db
    .select({ status: T.courses.status, bilingual: T.courses.bilingual, primaryLocale: T.courses.primaryLocale })
    .from(T.courses)
    .where(eq(T.courses.slug, slug))
    .limit(1);
  if (!current) return { ok: false, message: 'not_found' };

  if (patch.primaryLocale !== undefined && !isValidLocale(patch.primaryLocale)) {
    return { ok: false, message: 'invalid_primary_locale' };
  }

  // Effective translation setting for THIS save — the (possibly just-toggled-
  // by-this-patch) bilingual/primaryLocale, falling back to the row's CURRENT
  // value for whichever one the patch doesn't touch (see the mirroring note
  // above `mirrorBilingualFields` below; hoisted up here since Stage 4 so the
  // resources path can use the same effective pair).
  const bilingual = patch.bilingual !== undefined ? patch.bilingual : current.bilingual;
  const primaryLocale = patch.primaryLocale !== undefined ? patch.primaryLocale : current.primaryLocale;

  // Stage 4 — mirror-then-validate for a monolingual course's resource
  // labels, strict both-labels validation for a bilingual one. See
  // `prepareResourcesForWrite` (the same path `updateLesson` traverses).
  let preparedResources: CourseResource[] | null = null;
  if (patch.resources !== undefined) {
    const prepared = prepareResourcesForWrite(patch.resources, bilingual, primaryLocale);
    if (!prepared.ok) return { ok: false, message: prepared.message };
    preparedResources = prepared.resources;
  }

  if (patch.category !== undefined && !COURSE_CATEGORIES.includes(patch.category)) {
    return { ok: false, message: 'invalid_category' };
  }

  const set: Partial<typeof T.courses.$inferInsert> = { updatedAt: new Date() };
  if (patch.icon !== undefined) set.icon = patch.icon;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.tags !== undefined) set.tags = sanitizeTags(patch.tags);
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
  if (preparedResources !== null) set.resources = preparedResources;
  if (patch.bilingual !== undefined) set.bilingual = patch.bilingual;
  if (patch.primaryLocale !== undefined) set.primaryLocale = patch.primaryLocale;

  const wasPublished = current.status === 'published';
  if (wasPublished) set.hasUnpublishedChanges = true;

  // THE ONE PLACE (Task: course-language) — see `mirrorBilingualFields`'s own
  // doc comment. `bilingual`/`primaryLocale` are the EFFECTIVE pair computed
  // above — a save that doesn't touch the toggle must mirror (or not) using
  // the course's existing setting, not silently reset it.
  const mirroredSet = mirrorBilingualFields(set, bilingual, primaryLocale);

  let tagsDeferred = false;
  try {
    await db.update(T.courses).set(mirroredSet).where(eq(T.courses.slug, slug));
  } catch (err) {
    // Pre-0022 window (an UPDATE only names the keys it is given, so only a
    // save that actually carries tags can hit this): drop the one missing
    // column and save the REST of the teacher's work rather than losing the
    // whole save — but SAY SO in the result (adversarial review: returning a
    // plain ok here made the editor show an unqualified « saved » while the
    // typed tags were silently discarded; after db:push the row would hold
    // NULL and the teacher's work would be gone without a trace).
    if (!isMissingColumnError(err) || mirroredSet.tags === undefined) throw err;
    const { tags: _droppedTags, ...withoutTags } = mirroredSet;
    await db.update(T.courses).set(withoutTags).where(eq(T.courses.slug, slug));
    tagsDeferred = true;
    console.warn('[courses/write] update dropped `tags` (pre-0022 DB) — run `npm run db:push`.');
  }
  await recordAudit({ action: 'update_course', userId: actor.id, admin: actor, detail: slug });
  if (wasPublished) revalidateCoursePaths(slug);
  return tagsDeferred ? { ok: true, message: 'tags_deferred' } : { ok: true };
}

/**
 * Persists a Bunny Collection guid onto a course (automatic Bunny
 * organization) — called by lib/bunny/organize.ts's `planOrganizedUpload`
 * the FIRST time a video upload for this course creates one.
 * Deliberately NOT audited/revalidated like the other course writes below:
 * it's an internal, best-effort bookkeeping field the public site never
 * reads, not an editorial change a teacher/admin made. Callers are expected
 * to wrap this themselves (never let it fail the upload it's part of).
 */
export async function setCourseBunnyCollectionId(slug: string, collectionId: string): Promise<void> {
  if (!dbConfigured()) return;
  await db
    .update(T.courses)
    .set({ bunnyCollectionId: collectionId, updatedAt: new Date() })
    .where(eq(T.courses.slug, slug));
}

export async function submitForReview(slug: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db
    .select({ status: T.courses.status, titleHt: T.courses.titleHt, titleFr: T.courses.titleFr })
    .from(T.courses)
    .where(eq(T.courses.slug, slug))
    .limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  await db
    .update(T.courses)
    .set({ status: 'pending_review', submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'submit_course_review', userId: actor.id, admin: actor, detail: slug });

  // Admin inbound signal (Stage 7 — the review queue used to be silent):
  // best-effort, AFTER the status flip is already durably recorded, so a
  // notification-write hiccup can never fail (or double-run) the submission
  // itself.
  try {
    await db.insert(T.adminNotifications).values({
      kind: 'course_review',
      severity: 'info',
      userId: actor.id,
      userName: actor.name,
      amountCents: null,
      detail: current.titleHt || current.titleFr || slug,
      read: false,
    });
  } catch (err) {
    console.error('[courses/write] submitForReview notification insert failed (submission already recorded):', err);
  }
  return { ok: true };
}

/**
 * Production hardening pass — the ONE enforced precondition for a course to
 * actually go (or STAY) live: at least one lesson, and EVERY lesson has a
 * real video attached. Before this, `lib/courses/readiness.ts`'s checklist
 * was DELIBERATELY only cosmetic (see that module's own header — "nothing
 * here blocks a save or a submit-for-review click") — nothing stopped
 * `publishCourse`/`approveCourse` from putting a videoless course in front
 * of a paying buyer. Reuses `computeCourseReadiness` (the SAME check the
 * studio/admin checklist UI already renders) instead of duplicating the
 * logic, so the UI and this gate can never drift apart.
 *
 * Deliberately narrow: only the lesson/video items block. The rest of the
 * checklist (promise text, main image, FAQ, chapter titles…) stays exactly
 * what it always was — a warning, not a gate — since none of those can
 * result in a buyer paying for a lesson that literally doesn't exist yet.
 * `!course` fails CLOSED (`not_ready`, not `ok: true`) — the caller already
 * confirmed the row exists moments earlier, so a `null` here only happens on
 * a genuine read failure, and refusing to publish is the safe direction.
 */
async function assertCourseSellable(
  slug: string,
): Promise<{ ok: true } | { ok: false; message: 'not_ready' }> {
  const course = await getAdminCourse(slug);
  if (!course) return { ok: false, message: 'not_ready' };
  const readiness = computeCourseReadiness(course);
  const sellable =
    readiness.find((r) => r.key === 'hasLesson')?.ok === true &&
    readiness.find((r) => r.key === 'allLessonsHaveVideo')?.ok === true;
  return sellable ? { ok: true } : { ok: false, message: 'not_ready' };
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
  const sellable = await assertCourseSellable(slug);
  if (!sellable.ok) return sellable;
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
  const [current] = await db
    .select({ status: T.courses.status, ownerUserId: T.courses.ownerUserId, titleHt: T.courses.titleHt, titleFr: T.courses.titleFr })
    .from(T.courses)
    .where(eq(T.courses.slug, slug))
    .limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending_review') return { ok: false, message: 'invalid_status' };
  const sellable = await assertCourseSellable(slug);
  if (!sellable.ok) return sellable;
  const now = new Date();
  await db
    .update(T.courses)
    .set({ status: 'published', hasUnpublishedChanges: false, publishedAt: now, reviewedBy: actor.id, updatedAt: now })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'approve_course', userId: actor.id, admin: actor, detail: slug });
  revalidateCoursePaths(slug);
  await sendCourseReviewEmail(slug, current, { kind: 'approved' });
  return { ok: true };
}

/** Admin course-review queue (Task C3-T3): reject a submitted course with a required note. Requires `current.status === 'pending_review'`. */
export async function rejectCourse(slug: string, note: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db
    .select({ status: T.courses.status, ownerUserId: T.courses.ownerUserId, titleHt: T.courses.titleHt, titleFr: T.courses.titleFr })
    .from(T.courses)
    .where(eq(T.courses.slug, slug))
    .limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending_review') return { ok: false, message: 'invalid_status' };
  await db
    .update(T.courses)
    .set({ status: 'rejected', reviewNote: note, reviewedBy: actor.id, updatedAt: new Date() })
    .where(eq(T.courses.slug, slug));
  await recordAudit({ action: 'reject_course', userId: actor.id, admin: actor, detail: slug, reason: note });
  revalidateCoursePaths(slug);
  await sendCourseReviewEmail(slug, current, { kind: 'rejected', note });
  return { ok: true };
}

/**
 * Stage 6 — the review-decision email to the course OWNER: approved carries
 * the public link, rejected carries the admin's note + a link straight to the
 * studio editor. Owner resolved via `courses.owner_user_id` → `users` (the
 * same resolution lib/teacher/admin.ts's `getOwnerDisplayNames` uses).
 * Best-effort, NEVER THROWS: an unowned course (legacy rows) or any lookup/
 * send failure is logged and swallowed — the review itself is already
 * durably recorded.
 */
async function sendCourseReviewEmail(
  slug: string,
  course: { ownerUserId: string | null; titleHt: string | null; titleFr: string | null },
  decision: { kind: 'approved' } | { kind: 'rejected'; note: string },
): Promise<void> {
  try {
    if (!course.ownerUserId) return;
    const [owner] = await db
      .select({ email: T.users.email, name: T.users.name, localePref: T.users.localePref })
      .from(T.users)
      .where(eq(T.users.id, course.ownerUserId))
      .limit(1);
    if (!owner?.email) return;
    const locale: 'fr' | 'ht' = owner.localePref === 'fr' ? 'fr' : 'ht';
    const courseTitle = (locale === 'fr' ? course.titleFr : course.titleHt) || course.titleFr || course.titleHt || slug;
    const email =
      decision.kind === 'approved'
        ? buildCourseApprovedHtml({
            locale,
            name: owner.name,
            courseTitle,
            publicUrl: `${SITE_URL}/${locale}/formations/${slug}`,
          })
        : buildCourseRejectedHtml({
            locale,
            name: owner.name,
            courseTitle,
            note: decision.note,
            editUrl: `${SITE_URL}/${locale}/enseigner/studio/cours/${slug}/editer`,
          });
    await sendEmail({ to: owner.email, subject: email.subject, html: email.html, text: email.text });
  } catch (err) {
    console.error(`[courses/write] course review email failed for ${slug} (review already recorded):`, err);
  }
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
  // Via the retrying selector, NOT a bare db.select() (adversarial review):
  // a bare select names EVERY schema column — `tags` included — and would
  // 42703 on a pre-0022 live DB before any guard below runs, breaking course
  // deletion for the whole deploy-to-db:push window. Only `code`/`status`
  // are read here, both present in every fallback projection.
  const current = await selectCourseRowBySlug(slug);
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

  const [inserted] = await db
    .insert(T.lessons)
    .values({ courseSlug: slug, index: nextIndex, titleHt: '', titleFr: '', isPreview: false })
    .returning({ id: T.lessons.id });
  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'add_lesson', userId: actor.id, admin: actor, detail: slug });
  // Task K2: the new lesson's id, so a caller (LessonsManager's per-chapter
  // "add lesson" button) can immediately `moveLessonToChapter` it — `addLesson`
  // itself takes no chapterId (see the plan's K2 note on this two-step shape).
  return { ok: true, lessonId: inserted?.id };
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
  /** Long-form teacher notes shown under the video (Task K1) — distinct from desc_ht/fr. */
  notes_ht: string;
  notes_fr: string;
  /** Links/downloads attached to the lesson (Task K1) — validated, see `validateResources`. */
  resources: CourseResource[];
}>;

/**
 * Every `lessons` ht/fr column pair (Task: lesson-language — the sibling of
 * `COURSE_BILINGUAL_PAIR_COLUMNS`, same shape, one level down): "title, desc,
 * notes". Fed to `mirrorBilingualFields` by `updateLesson` below, exactly
 * like the course-level list is fed by `updateCourse` — a course that opted
 * into "kreyòl only" (or "français only") must not still force a teacher to
 * fill in the OTHER language on every single lesson.
 */
export const LESSON_BILINGUAL_PAIR_COLUMNS: readonly (readonly [string, string])[] = [
  ['titleHt', 'titleFr'],
  ['descHt', 'descFr'],
  ['notesHt', 'notesFr'],
];

/**
 * Resolves the PARENT COURSE's `bilingual`/`primaryLocale` for
 * `updateLesson`'s mirroring below (and, since Task: chapter-language,
 * `updateChapter`'s — same parent-course lookup, just fed a different
 * column-pair list, see `CHAPTER_BILINGUAL_PAIR_COLUMNS`) — resolved
 * server-side from the `courses` row, NEVER trusted from the client (a
 * stale/tampered client flag could otherwise mirror the wrong side, or
 * mirror when the course is actually bilingual).
 *
 * NEVER THROWS — mirrors lib/courses/source.ts's `selectCourseRowBySlug`
 * migration-resilience pattern: if the course row is missing, OR the
 * `bilingual`/`primary_locale` columns don't exist yet on this DB (this
 * migration hasn't been pushed — the query itself fails), this DEFAULTS TO
 * BILINGUAL. Bilingual is the safe "do nothing" default `mirrorBilingualFields`
 * already understands — it never hides a field or overwrites one locale's
 * real content with a guess.
 */
async function resolveLessonMirrorContext(slug: string): Promise<{ bilingual: boolean; primaryLocale: 'ht' | 'fr' }> {
  try {
    const [row] = await db
      .select({ bilingual: T.courses.bilingual, primaryLocale: T.courses.primaryLocale })
      .from(T.courses)
      .where(eq(T.courses.slug, slug))
      .limit(1);
    if (!row) return { bilingual: true, primaryLocale: 'ht' };
    return { bilingual: row.bilingual ?? true, primaryLocale: row.primaryLocale ?? 'ht' };
  } catch (err) {
    console.warn(
      `[courses/write] resolveLessonMirrorContext fell back to bilingual defaults for "${slug}" (missing primary_locale/bilingual column? run \`npm run db:push\`):`,
      err,
    );
    return { bilingual: true, primaryLocale: 'ht' };
  }
}

/**
 * Pure decision for `updateLesson`'s orphan-cleanup gate, extracted for unit
 * testing (previously an inline, untested conditional — see
 * lib/courses/write.test.ts). A REPLACEMENT (both ids non-empty AND
 * different) is the only case that should delete the OLD video from Bunny:
 * - same id (a plain no-op write) → false, nothing changed.
 * - clearing to empty (`newId` blank) → false, a deliberate detach, not a
 *   "this video is gone" signal.
 * - first-time set (`oldId` empty/null) → false, nothing to replace.
 */
export function shouldReplaceBunnyVideo(oldId: string | null | undefined, newId: string | null | undefined): boolean {
  return Boolean(oldId && newId && oldId !== newId);
}

/**
 * CRITICAL guard (bunny-organization branch fix): `lessons.bunny_video_id`
 * has no uniqueness constraint, and the lesson editor's free-text "coller un
 * ID Bunny" input (shared by admin CMS + teacher studio) lets the SAME guid
 * legitimately be pasted onto two lessons (reuse, or copy/paste). Both
 * orphan-cleanup call sites (`updateLesson`'s replacement branch,
 * `deleteLesson`) must check whether any OTHER lesson row still references a
 * guid before deleting it from Bunny — otherwise replacing/deleting lesson
 * A's video silently 404s lesson B's for students.
 *
 * GLOBAL across the whole `lessons` table, deliberately NOT scoped to a
 * course slug: Bunny guids are library-wide, not per-course, so a guid reused
 * across two different courses must be caught too.
 *
 * Fails "referenced" (skip the delete) on any query error — this is a
 * best-effort lookup guarding an irreversible external delete, so keeping
 * the video around on a lookup failure is the only safe default.
 */
async function isBunnyVideoStillReferencedElsewhere(videoId: string, excludeLessonId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: T.lessons.id })
      .from(T.lessons)
      .where(and(eq(T.lessons.bunnyVideoId, videoId), ne(T.lessons.id, excludeLessonId)))
      .limit(1);
    return rows.length > 0;
  } catch (e) {
    console.error(
      `[courses/write] bunny still-referenced check failed for guid ${videoId} (fail-safe: keeping the video, skipping delete):`,
      e,
    );
    return true;
  }
}

export async function updateLesson(
  slug: string,
  lessonId: string,
  patch: LessonPatch,
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();

  // Parent-course translation context (Task: lesson-language, extended by
  // Stage 4): resolved ONCE, and only when this patch touches something that
  // needs it — a mirrored title/desc/notes pair OR the resources list (whose
  // per-row labels mirror the same way, see `prepareResourcesForWrite`). A
  // plain video/duration/preview save still skips the extra course read.
  const touchesLessonMirror =
    patch.title_ht !== undefined ||
    patch.title_fr !== undefined ||
    patch.desc_ht !== undefined ||
    patch.desc_fr !== undefined ||
    patch.notes_ht !== undefined ||
    patch.notes_fr !== undefined;
  const mirrorContext =
    touchesLessonMirror || patch.resources !== undefined ? await resolveLessonMirrorContext(slug) : null;

  // Stage 4 — the SAME mirror-then-validate resource path `updateCourse`
  // traverses, fed the parent course's server-resolved translation setting.
  let preparedResources: CourseResource[] | null = null;
  if (patch.resources !== undefined) {
    const ctx = mirrorContext ?? { bilingual: true, primaryLocale: 'ht' as const };
    const prepared = prepareResourcesForWrite(patch.resources, ctx.bilingual, ctx.primaryLocale);
    if (!prepared.ok) return { ok: false, message: prepared.message };
    preparedResources = prepared.resources;
  }

  // Orphan cleanup (best-effort — see lib/bunny/upload.ts's `deleteBunnyVideo`
  // doc comment): only read the lesson's CURRENT `bunnyVideoId` when the
  // patch actually touches that field — every other edit (title, desc,
  // resources, …) skips this extra read entirely. See `shouldReplaceBunnyVideo`
  // for which case actually counts as a replacement.
  let oldVideoIdToDelete: string | null = null;
  if (patch.bunnyVideoId !== undefined && bunnyUploadConfigured()) {
    const [before] = await db
      .select({ bunnyVideoId: T.lessons.bunnyVideoId })
      .from(T.lessons)
      .where(and(eq(T.lessons.courseSlug, slug), eq(T.lessons.id, lessonId)))
      .limit(1);
    const oldId = before?.bunnyVideoId ?? null;
    const newId = patch.bunnyVideoId || null;
    if (shouldReplaceBunnyVideo(oldId, newId)) oldVideoIdToDelete = oldId;
  }

  const set: Partial<typeof T.lessons.$inferInsert> = { updatedAt: new Date() };
  if (patch.title_ht !== undefined) set.titleHt = patch.title_ht;
  if (patch.title_fr !== undefined) set.titleFr = patch.title_fr;
  if (patch.desc_ht !== undefined) set.descHt = patch.desc_ht;
  if (patch.desc_fr !== undefined) set.descFr = patch.desc_fr;
  if (patch.bunnyVideoId !== undefined) set.bunnyVideoId = patch.bunnyVideoId || null;
  if (patch.durationSeconds !== undefined) set.durationSeconds = patch.durationSeconds;
  if (patch.isPreview !== undefined) set.isPreview = patch.isPreview;
  if (patch.notes_ht !== undefined) set.notesHt = patch.notes_ht;
  if (patch.notes_fr !== undefined) set.notesFr = patch.notes_fr;
  if (preparedResources !== null) set.resources = preparedResources;

  // Lesson-level optional translation (Task: lesson-language) — when the
  // PARENT COURSE is monolingual, mirror this save's primary-locale value
  // into both columns for title/desc/notes, the SAME `mirrorBilingualFields`
  // helper `updateCourse` uses for course fields (see its doc comment) —
  // just fed `LESSON_BILINGUAL_PAIR_COLUMNS` instead. `mirrorContext` was
  // resolved above, only when actually needed.
  let mirroredSet = set;
  if (touchesLessonMirror && mirrorContext) {
    mirroredSet = mirrorBilingualFields(set, mirrorContext.bilingual, mirrorContext.primaryLocale, LESSON_BILINGUAL_PAIR_COLUMNS);
  }

  const res = await db
    .update(T.lessons)
    .set(mirroredSet)
    .where(and(eq(T.lessons.courseSlug, slug), eq(T.lessons.id, lessonId)))
    .returning({ id: T.lessons.id });
  if (res.length === 0) return { ok: false, message: 'not_found' };

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'update_lesson', userId: actor.id, admin: actor, detail: `${slug}#${lessonId}` });

  // Fired AFTER the write/audit succeed, and never allowed to affect this
  // function's result — a replaced video is gone from Bunny for good the
  // moment this lesson's edit is saved (documented in LessonPatch's
  // `bunnyVideoId` field / VideoUpload's flow: uploading a new video for an
  // already-recorded lesson calls updateLesson with the new guid). EXCEPT
  // when some OTHER lesson still references the same guid (see
  // `isBunnyVideoStillReferencedElsewhere`) — deleting it then would 404 that
  // other lesson's playback for students, so the delete is skipped.
  if (oldVideoIdToDelete) {
    const stillReferenced = await isBunnyVideoStillReferencedElsewhere(oldVideoIdToDelete, lessonId);
    if (stillReferenced) {
      console.info(
        `[courses/write] updateLesson: keeping Bunny video ${oldVideoIdToDelete} — still referenced by another lesson (${slug}#${lessonId})`,
      );
    } else {
      try {
        await deleteBunnyVideo(oldVideoIdToDelete);
      } catch (e) {
        console.error(`[courses/write] updateLesson bunny cleanup (replaced video) failed for ${slug}#${lessonId} (non-fatal):`, e);
      }
    }
  }

  return { ok: true };
}

export async function deleteLesson(slug: string, lessonId: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const res = await db
    .delete(T.lessons)
    .where(and(eq(T.lessons.courseSlug, slug), eq(T.lessons.id, lessonId)))
    .returning({ id: T.lessons.id, bunnyVideoId: T.lessons.bunnyVideoId });
  if (res.length === 0) return { ok: false, message: 'not_found' };

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'delete_lesson', userId: actor.id, admin: actor, detail: `${slug}#${lessonId}` });

  // Orphan cleanup (best-effort — see lib/bunny/upload.ts's `deleteBunnyVideo`
  // doc comment): a lesson's video has nowhere else to be referenced from
  // once the row is gone, so without this it just sits in the Bunny library
  // forever (storage cost + dashboard clutter). NEVER allowed to affect this
  // function's result — the lesson row is already gone regardless of
  // whether Bunny cleanup succeeds. EXCEPT when some OTHER lesson still
  // references the same guid (see `isBunnyVideoStillReferencedElsewhere`) —
  // deleting it then would 404 that other lesson's playback for students, so
  // the delete is skipped (the video just stays in Bunny, same as today).
  const oldVideoId = res[0]?.bunnyVideoId ?? null;
  if (oldVideoId && bunnyUploadConfigured()) {
    const stillReferenced = await isBunnyVideoStillReferencedElsewhere(oldVideoId, lessonId);
    if (stillReferenced) {
      console.info(
        `[courses/write] deleteLesson: keeping Bunny video ${oldVideoId} — still referenced by another lesson (${slug}#${lessonId})`,
      );
    } else {
      try {
        await deleteBunnyVideo(oldVideoId);
      } catch (e) {
        console.error(`[courses/write] deleteLesson bunny cleanup failed for ${slug}#${lessonId} (non-fatal):`, e);
      }
    }
  }

  return { ok: true };
}

/**
 * Pure neighbour-selection + swap math for `reorderLessons` (mirroring
 * `computeAdjacentSwap` further below, used by `reorderChapters`): given
 * every lesson row of the course (already sorted by `index` ascending) and
 * the id of the lesson being moved, first scopes the candidate neighbours
 * down to lessons sharing the SAME `chapterId` as the moving lesson — `null`
 * counts as its own group, matching the UI's "hors chapitre" bucket in
 * LessonsManager.tsx — then delegates to `computeAdjacentSwap` for the
 * actual up/down pick. Exported for unit testing without a DB.
 *
 * Scoping matters because `addLesson` always appends at the course-wide
 * `max(index) + 1`, so chapters interleave under normal use (e.g. add 2
 * lessons to chapter 1, 1 to chapter 2, then 1 more to chapter 1 ->
 * ch1=[idx1,idx2,idx4], ch2=[idx3]). A naive GLOBALLY-adjacent swap would
 * silently rewrite a lesson's index in a DIFFERENT chapter than the one
 * being edited — invisible in the editor (the UI's up/down buttons are
 * boundary-checked per chapter, so they never disable the button that
 * triggers this), and it perturbs the shared flat `lessons` ordering other
 * consumers rely on.
 *
 * BACKWARD COMPATIBLE: for a flat, pre-chapters course every lesson has
 * `chapterId === null`, so "same chapter" is the whole course and this
 * behaves exactly like the old course-wide adjacency.
 */
export function computeLessonSwap(
  allSortedByIndex: { id: string; chapterId: string | null }[],
  lessonId: string,
  dir: 'up' | 'down',
): [string, string] | null {
  const moving = allSortedByIndex.find((r) => r.id === lessonId);
  if (!moving) return null;
  const scoped = allSortedByIndex.filter((r) => r.chapterId === moving.chapterId);
  return computeAdjacentSwap(scoped.map((r) => r.id), lessonId, dir);
}

/**
 * Swaps a lesson with its adjacent-in-order neighbour WITHIN ITS OWN CHAPTER
 * (see `computeLessonSwap` above for why the neighbour must be chapter-
 * scoped). `lessons` has a unique(course_slug, index) constraint, so a naive
 * 2-statement swap can transiently give two rows the same index within the
 * same command (Postgres checks a non-deferred unique constraint per row as
 * it applies each update) — the 3rd write through a scratch sentinel index
 * (`-1`, never a valid lesson position) avoids that collision. No
 * transaction wraps this (the neon-http driver doesn't support one — see
 * db/index.ts): a failure between steps would leave one lesson at `-1`,
 * self-healing on the next successful reorder of that same lesson, and
 * never surfaced publicly since `lib/courses/source.ts` always re-sorts by
 * `index` before returning an array (a temporarily-out-of-range value only
 * affects relative order, it's never rendered).
 */
export async function reorderLessons(
  slug: string,
  lessonId: string,
  dir: 'up' | 'down',
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const rows = await db.select().from(T.lessons).where(eq(T.lessons.courseSlug, slug)).orderBy(asc(T.lessons.index));
  const swap = computeLessonSwap(rows, lessonId, dir);
  if (!swap) return { ok: false, message: 'invalid_move' };

  const a = rows.find((r) => r.id === swap[0])!;
  const b = rows.find((r) => r.id === swap[1])!;
  const now = new Date();
  await db.update(T.lessons).set({ index: -1, updatedAt: now }).where(eq(T.lessons.id, a.id));
  await db.update(T.lessons).set({ index: a.index, updatedAt: now }).where(eq(T.lessons.id, b.id));
  await db.update(T.lessons).set({ index: b.index, updatedAt: now }).where(eq(T.lessons.id, a.id));

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'reorder_lesson', userId: actor.id, admin: actor, detail: `${slug}#${lessonId}:${dir}` });
  return { ok: true };
}

/* ------------------------------- chapters ----------------------------------- */
/**
 * Task K1 (plan de cours complet) — a course's parts/modules. Every op below
 * mirrors the lesson equivalents just above (same audited + revalidated
 * shape); ownership is enforced one layer up, in the studio/admin wrappers
 * (lib/teacher/studio-actions.ts / lib/admin/content-actions.ts), same
 * division of labour as every other write in this file.
 */

export type ChapterPatch = Partial<{
  title_ht: string;
  title_fr: string;
  summary_ht: string;
  summary_fr: string;
}>;

/**
 * Every `course_chapters` ht/fr column pair (Task: chapter-language — the
 * sibling of `LESSON_BILINGUAL_PAIR_COLUMNS`, same shape, same reasoning):
 * "title, summary". Fed to `mirrorBilingualFields` by `updateChapter` below,
 * so a monolingual course's chapter fields behave exactly like its course-
 * and lesson-level fields — one input, one column written, the other column
 * mirrored server-side so no reader ever sees an empty string.
 */
export const CHAPTER_BILINGUAL_PAIR_COLUMNS: readonly (readonly [string, string])[] = [
  ['titleHt', 'titleFr'],
  ['summaryHt', 'summaryFr'],
];

/**
 * Pure adjacent-swap index math shared by `reorderChapters` (and mirroring
 * `reorderLessons`'s identical shape above): given ids already sorted in
 * display order, the id to move, and a direction, returns the `[mover,
 * neighbour]` pair to swap, or `null` if the move is invalid (id not found,
 * or already at that edge). Exported for unit testing without a DB.
 */
export function computeAdjacentSwap(ids: string[], id: string, dir: 'up' | 'down'): [string, string] | null {
  const i = ids.indexOf(id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  return [ids[i], ids[j]];
}

/**
 * Pure repack math for `deleteChapter`: given the remaining chapters already
 * sorted by their CURRENT index (ascending, gaps allowed — e.g. [1,2,4,5]
 * after deleting the chapter that held index 3), returns the new sequential
 * 1..n index each position should get ([1,2,3,4]), order preserved. Exported
 * for unit testing without a DB — see `deleteChapter`'s doc comment for why
 * the actual DB write still needs a two-phase scratch-index pass.
 */
export function repackChapterIndices<T>(remainingSortedByIndex: T[]): number[] {
  return remainingSortedByIndex.map((_, i) => i + 1);
}

/** Appends a new chapter at the next index for `slug`. */
export async function createChapter(
  slug: string,
  input: { title_ht: string; title_fr: string },
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const [course] = await db.select({ slug: T.courses.slug }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
  if (!course) return { ok: false, message: 'not_found' };

  const rows = await db
    .select({ index: T.courseChapters.index })
    .from(T.courseChapters)
    .where(eq(T.courseChapters.courseSlug, slug));
  const nextIndex = rows.length ? Math.max(...rows.map((r) => r.index)) + 1 : 1;

  await db.insert(T.courseChapters).values({
    courseSlug: slug,
    index: nextIndex,
    titleHt: input.title_ht?.trim() || '',
    titleFr: input.title_fr?.trim() || '',
  });
  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'create_chapter', userId: actor.id, admin: actor, detail: slug });
  return { ok: true };
}

export async function updateChapter(
  slug: string,
  chapterId: string,
  patch: ChapterPatch,
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const set: Partial<typeof T.courseChapters.$inferInsert> = { updatedAt: new Date() };
  if (patch.title_ht !== undefined) set.titleHt = patch.title_ht;
  if (patch.title_fr !== undefined) set.titleFr = patch.title_fr;
  if (patch.summary_ht !== undefined) set.summaryHt = patch.summary_ht;
  if (patch.summary_fr !== undefined) set.summaryFr = patch.summary_fr;

  // Chapter-level optional translation (Task: chapter-language) — when the
  // PARENT COURSE is monolingual, mirror this save's primary-locale value
  // into both columns for title/summary, the SAME `mirrorBilingualFields`
  // helper `updateLesson` uses (see its doc comment on
  // `resolveLessonMirrorContext`) — just fed `CHAPTER_BILINGUAL_PAIR_COLUMNS`
  // instead. Only paid for when the patch actually touches one of the two
  // mirrored pairs.
  const touchesChapterMirror =
    patch.title_ht !== undefined ||
    patch.title_fr !== undefined ||
    patch.summary_ht !== undefined ||
    patch.summary_fr !== undefined;
  let mirroredSet = set;
  if (touchesChapterMirror) {
    const { bilingual, primaryLocale } = await resolveLessonMirrorContext(slug);
    mirroredSet = mirrorBilingualFields(set, bilingual, primaryLocale, CHAPTER_BILINGUAL_PAIR_COLUMNS);
  }

  const res = await db
    .update(T.courseChapters)
    .set(mirroredSet)
    .where(and(eq(T.courseChapters.courseSlug, slug), eq(T.courseChapters.id, chapterId)))
    .returning({ id: T.courseChapters.id });
  if (res.length === 0) return { ok: false, message: 'not_found' };

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'update_chapter', userId: actor.id, admin: actor, detail: `${slug}#${chapterId}` });
  return { ok: true };
}

/**
 * Deletes the chapter — NEVER its lessons (ungroups them: `chapter_id` ->
 * null, "hors chapitre", per the plan) — then re-packs the remaining
 * chapters' indices to close the gap. The re-pack uses the SAME two-phase
 * scratch-index trick `reorderChapters`/`reorderLessons` use (negative
 * sentinel values first, then the final sequential ones): a naive single-pass
 * renumber can transiently collide with unique(course_slug, index) — e.g.
 * moving row A from index 4 to 3 while row B still legitimately holds index 3
 * until ITS OWN update runs later in the loop.
 */
export async function deleteChapter(slug: string, chapterId: string, actor: AdminActor): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();

  const [chapter] = await db
    .select({ id: T.courseChapters.id })
    .from(T.courseChapters)
    .where(and(eq(T.courseChapters.courseSlug, slug), eq(T.courseChapters.id, chapterId)))
    .limit(1);
  if (!chapter) return { ok: false, message: 'not_found' };

  await db
    .update(T.lessons)
    .set({ chapterId: null, updatedAt: new Date() })
    .where(and(eq(T.lessons.courseSlug, slug), eq(T.lessons.chapterId, chapterId)));

  await db.delete(T.courseChapters).where(eq(T.courseChapters.id, chapterId));

  const remaining = await db
    .select()
    .from(T.courseChapters)
    .where(eq(T.courseChapters.courseSlug, slug))
    .orderBy(asc(T.courseChapters.index));
  const newIndices = repackChapterIndices(remaining);
  const now = new Date();
  for (let i = 0; i < remaining.length; i++) {
    await db.update(T.courseChapters).set({ index: -(i + 1), updatedAt: now }).where(eq(T.courseChapters.id, remaining[i].id));
  }
  for (let i = 0; i < remaining.length; i++) {
    await db.update(T.courseChapters).set({ index: newIndices[i], updatedAt: now }).where(eq(T.courseChapters.id, remaining[i].id));
  }

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'delete_chapter', userId: actor.id, admin: actor, detail: `${slug}#${chapterId}` });
  return { ok: true };
}

/** Swaps a chapter with its adjacent-in-order neighbour — same scratch-index-swap shape as `reorderLessons` above. */
export async function reorderChapters(
  slug: string,
  chapterId: string,
  dir: 'up' | 'down',
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();
  const rows = await db
    .select()
    .from(T.courseChapters)
    .where(eq(T.courseChapters.courseSlug, slug))
    .orderBy(asc(T.courseChapters.index));
  const swap = computeAdjacentSwap(rows.map((r) => r.id), chapterId, dir);
  if (!swap) return { ok: false, message: 'invalid_move' };

  const a = rows.find((r) => r.id === swap[0])!;
  const b = rows.find((r) => r.id === swap[1])!;
  const now = new Date();
  await db.update(T.courseChapters).set({ index: -1, updatedAt: now }).where(eq(T.courseChapters.id, a.id));
  await db.update(T.courseChapters).set({ index: a.index, updatedAt: now }).where(eq(T.courseChapters.id, b.id));
  await db.update(T.courseChapters).set({ index: b.index, updatedAt: now }).where(eq(T.courseChapters.id, a.id));

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({ action: 'reorder_chapter', userId: actor.id, admin: actor, detail: `${slug}#${chapterId}:${dir}` });
  return { ok: true };
}

/**
 * Moves a lesson into a chapter (or back to "hors chapitre" when `chapterId`
 * is `null`) — only ever touches `chapter_id`, never `index`: ordering within
 * a chapter follows the lesson's existing global per-course `index` ascending
 * (see the plan's Rules section), so the unique(course_slug, index)
 * constraint never needs a rewrite here.
 */
export async function moveLessonToChapter(
  slug: string,
  lessonId: string,
  chapterId: string | null,
  actor: AdminActor,
): Promise<CourseWriteResult> {
  if (!dbConfigured()) return dbRequired();

  if (chapterId !== null) {
    const [chapter] = await db
      .select({ id: T.courseChapters.id })
      .from(T.courseChapters)
      .where(and(eq(T.courseChapters.courseSlug, slug), eq(T.courseChapters.id, chapterId)))
      .limit(1);
    if (!chapter) return { ok: false, message: 'invalid_chapter' };
  }

  const res = await db
    .update(T.lessons)
    .set({ chapterId, updatedAt: new Date() })
    .where(and(eq(T.lessons.courseSlug, slug), eq(T.lessons.id, lessonId)))
    .returning({ id: T.lessons.id });
  if (res.length === 0) return { ok: false, message: 'not_found' };

  await markDirtyAndRevalidateIfPublished(slug);
  await recordAudit({
    action: 'move_lesson_to_chapter',
    userId: actor.id,
    admin: actor,
    detail: `${slug}#${lessonId}->${chapterId ?? 'none'}`,
  });
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
