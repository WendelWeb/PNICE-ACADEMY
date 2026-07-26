/**
 * lib/reviews/reviews.ts — course-review reads (Task C3-T6). Companion to
 * lib/reviews/actions.ts (the 'use server' write path). Mirrors the
 * established gated-read pattern used across lib/courses/source.ts and
 * lib/teacher/profile.ts exactly:
 *
 * GATED + NEVER-THROW: no DATABASE_URL, OR the query fails, OR nothing
 * matches ⇒ a safe empty value (`null`/`0`/`[]`), never throws. This is what
 * keeps the public sales page, /prof, and the admin queue rendering (with an
 * honest empty state) before/without a live DB.
 *
 * TEACHER RATING MATH (the one place it happens, unit-tested in
 * reviews.test.ts): `weightedAverage` takes each of the teacher's courses'
 * (avg, count) pair and combines them weighted by review count — a course
 * with 200 reviews at 4.2★ should move the teacher's overall number far more
 * than a course with 2 reviews at 5★. This is mathematically the same as
 * pooling every individual review's stars into one flat average (weighted
 * sum / total count), but is expressed per-course because that's the natural
 * shape the DB read produces (grouped by course_slug) and it's what the spec
 * literally asks for ("weighted avg across their courses' reviews, weight by
 * review count").
 */
import { eq, and, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { getTickets } from '@/lib/admin/data';

const T = schema;

/** Max comment length — shared by the client widget (maxLength attr) and the
 *  server action's own defense-in-depth check (never trust the client). */
export const COMMENT_MAX_LENGTH = 1000;

/**
 * Clamp/validate a client-supplied star rating to the integer 1..5 range
 * required by db/schema.ts's `course_reviews.stars` column. Pulled out as a
 * plain (non-'use server') export — like lib/teacher/apply-validation.ts's
 * `validateApplyInput` — so both the client rating widget (immediate
 * feedback) and lib/reviews/actions.ts's `submitReviewAction` (defense in
 * depth — never trust the client) share the exact same rule, and so it's
 * unit-testable without a DB.
 */
export function clampStars(input: number): number | null {
  const n = Math.round(Number(input));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

export type ReviewRow = {
  id: string;
  courseSlug: string;
  userId: string;
  reviewerName: string;
  stars: number;
  comment: string | null;
  status: 'published' | 'removed';
  createdAt: string;
  updatedAt: string;
};

export type AdminReviewRow = ReviewRow & {
  courseTitleHt: string;
  courseTitleFr: string;
  reviewerEmail: string;
  reported: boolean;
};

export type RatingSummary = { avg: number | null; count: number };
export type CourseRatingStat = { avg: number; count: number };

function iso(d: Date | string): string {
  return typeof d === 'string' ? d : d.toISOString();
}

type DbReviewRow = typeof T.courseReviews.$inferSelect;

function toReviewRow(row: DbReviewRow, reviewerName: string): ReviewRow {
  return {
    id: row.id,
    courseSlug: row.courseSlug,
    userId: row.userId,
    reviewerName,
    stars: row.stars,
    comment: row.comment ?? null,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * A course's rating (avg + count) over PUBLISHED reviews only. GATED +
 * FALLBACK: no DATABASE_URL, no reviews, or a failed query ⇒ `{ avg: null,
 * count: 0 }`, never throws.
 */
export async function getCourseRating(courseSlug: string): Promise<RatingSummary> {
  const empty: RatingSummary = { avg: null, count: 0 };
  if (!dbConfigured()) return empty;
  try {
    const rows = await db
      .select({ stars: T.courseReviews.stars })
      .from(T.courseReviews)
      .where(and(eq(T.courseReviews.courseSlug, courseSlug), eq(T.courseReviews.status, 'published')));
    if (rows.length === 0) return empty;
    const sum = rows.reduce((acc, r) => acc + r.stars, 0);
    return { avg: sum / rows.length, count: rows.length };
  } catch (err) {
    console.error('[reviews] getCourseRating DB read failed, falling back to empty:', err);
    return empty;
  }
}

/**
 * Recent PUBLISHED reviews for a course, newest first, with the reviewer's
 * display name resolved. GATED + FALLBACK: no DATABASE_URL or a failed query
 * ⇒ `[]`, never throws.
 */
export async function getCourseReviews(courseSlug: string, limit = 10): Promise<ReviewRow[]> {
  if (!dbConfigured()) return [];
  try {
    const rows = await db
      .select({ review: T.courseReviews, user: T.users })
      .from(T.courseReviews)
      .innerJoin(T.users, eq(T.courseReviews.userId, T.users.id))
      .where(and(eq(T.courseReviews.courseSlug, courseSlug), eq(T.courseReviews.status, 'published')));
    return rows
      .map(({ review, user }) => toReviewRow(review, user.name ?? user.certificateName ?? ''))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch (err) {
    console.error('[reviews] getCourseReviews DB read failed, falling back to []:', err);
    return [];
  }
}

/**
 * The signed-in learner's own review for a course (any status — including a
 * removed one, so their widget can show what happened rather than silently
 * looking empty), or `null` if they haven't rated it yet. GATED + FALLBACK:
 * no DATABASE_URL, no row, or a failed query ⇒ `null`, never throws.
 */
export async function getMyReview(userId: string, courseSlug: string): Promise<ReviewRow | null> {
  if (!dbConfigured() || !userId) return null;
  try {
    const [row] = await db
      .select()
      .from(T.courseReviews)
      .where(and(eq(T.courseReviews.courseSlug, courseSlug), eq(T.courseReviews.userId, userId)))
      .limit(1);
    return row ? toReviewRow(row, '') : null;
  } catch (err) {
    console.error('[reviews] getMyReview DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * Pure: combine each of a teacher's courses' (avg, count) rating into one
 * overall figure, weighted by review count (see file header). Exported for
 * unit testing without a DB — the ONE place this math happens.
 */
export function weightedAverage(stats: CourseRatingStat[]): RatingSummary {
  const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
  if (totalCount === 0) return { avg: null, count: 0 };
  const weightedSum = stats.reduce((sum, s) => sum + s.avg * s.count, 0);
  return { avg: weightedSum / totalCount, count: totalCount };
}

/**
 * A teacher's overall rating: every PUBLISHED review across every course
 * they own, combined via `weightedAverage`. GATED + FALLBACK: no
 * DATABASE_URL, the teacher owns no courses, none of their courses have a
 * published review, or a failed query ⇒ `{ avg: null, count: 0 }`, never
 * throws.
 */
export async function getTeacherRating(ownerUserId: string): Promise<RatingSummary> {
  const empty: RatingSummary = { avg: null, count: 0 };
  if (!dbConfigured() || !ownerUserId) return empty;
  try {
    const courseRows = await db
      .select({ slug: T.courses.slug })
      .from(T.courses)
      .where(eq(T.courses.ownerUserId, ownerUserId));
    if (courseRows.length === 0) return empty;
    const slugs = courseRows.map((r) => r.slug);

    const reviewRows = await db
      .select({ courseSlug: T.courseReviews.courseSlug, stars: T.courseReviews.stars })
      .from(T.courseReviews)
      .where(and(inArray(T.courseReviews.courseSlug, slugs), eq(T.courseReviews.status, 'published')));
    if (reviewRows.length === 0) return empty;

    const bySlug = new Map<string, number[]>();
    for (const r of reviewRows) {
      const arr = bySlug.get(r.courseSlug) ?? [];
      arr.push(r.stars);
      bySlug.set(r.courseSlug, arr);
    }
    const stats: CourseRatingStat[] = [...bySlug.values()].map((starsArr) => ({
      avg: starsArr.reduce((a, b) => a + b, 0) / starsArr.length,
      count: starsArr.length,
    }));
    return weightedAverage(stats);
  } catch (err) {
    console.error('[reviews] getTeacherRating DB read failed, falling back to empty:', err);
    return empty;
  }
}

/**
 * Resolves a static `data/teachers.ts` `Teacher`'s DB `users.id` (needed by
 * `getTeacherRating`, which is keyed on `courses.owner_user_id`) from any of
 * their `courseSlugs` — mirrors lib/teacher/earnings.ts's `resolveTeacherUserId`
 * reasoning: the public `Course` shape (lib/courses/source.ts) doesn't carry
 * `owner_user_id` at all, so this reads the `courses` table directly. GATED +
 * FALLBACK: no DATABASE_URL, no matching course, no owner set, or a failed
 * query ⇒ `null`, never throws — /prof/[slug] falls back to the honest
 * "—" rating display exactly like it does today with no DB.
 */
export async function getTeacherOwnerUserId(courseSlugs: string[]): Promise<string | null> {
  if (!dbConfigured() || courseSlugs.length === 0) return null;
  try {
    const rows = await db
      .select({ ownerUserId: T.courses.ownerUserId })
      .from(T.courses)
      .where(inArray(T.courses.slug, courseSlugs));
    return rows.find((r) => r.ownerUserId)?.ownerUserId ?? null;
  } catch (err) {
    console.error('[reviews] getTeacherOwnerUserId DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * A single review by id, regardless of status — used by lib/reviews/actions.ts
 * to build a meaningful report ticket / verify a target before removal.
 * GATED + FALLBACK: no DATABASE_URL, no row, or a failed query ⇒ `null`,
 * never throws.
 */
export async function getReviewById(id: string): Promise<ReviewRow | null> {
  if (!dbConfigured() || !id) return null;
  try {
    const [row] = await db.select().from(T.courseReviews).where(eq(T.courseReviews.id, id)).limit(1);
    return row ? toReviewRow(row, '') : null;
  } catch (err) {
    console.error('[reviews] getReviewById DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * The `[review:<id>]` tag embedded in a report ticket's message by
 * `reportReviewAction` (see lib/reviews/actions.ts) — reused here to derive
 * which reviews currently have an open report, without any schema change
 * (mirrors the existing "'other'-type support ticket, zero schema change"
 * convention already used by lib/site-actions-public.ts's
 * `registerTeachInterestAction`).
 */
const REVIEW_TAG_RE = /\[review:([a-f0-9-]+)\]/i;

/**
 * Review ids with at least one still-open (`open`/`in_progress`) report
 * ticket. GATED + FALLBACK (via getTickets, which itself never throws in
 * mock mode and is DB-backed only when ADMIN_DATA_SOURCE=real) ⇒ an empty
 * set on any failure.
 */
export async function getReportedReviewIds(): Promise<Set<string>> {
  try {
    const page = await getTickets({ type: 'other', pageSize: 500 });
    const ids = new Set<string>();
    for (const t of page.rows) {
      if (t.status === 'resolved') continue;
      const m = t.message.match(REVIEW_TAG_RE);
      if (m) ids.add(m[1]);
    }
    return ids;
  } catch (err) {
    console.error('[reviews] getReportedReviewIds failed, falling back to empty set:', err);
    return new Set();
  }
}

/**
 * Every review, newest first, for the admin moderation queue
 * (`/admin/enseignants?view=reviews`) — joined with the course title and the
 * reviewer's name/email. GATED + FALLBACK: no DATABASE_URL or a failed query
 * ⇒ `[]`, never throws.
 */
export async function listReviewsForAdmin(limit = 200): Promise<AdminReviewRow[]> {
  if (!dbConfigured()) return [];
  try {
    const [rows, reported] = await Promise.all([
      db
        .select({ review: T.courseReviews, user: T.users, course: T.courses })
        .from(T.courseReviews)
        .innerJoin(T.users, eq(T.courseReviews.userId, T.users.id))
        .innerJoin(T.courses, eq(T.courseReviews.courseSlug, T.courses.slug)),
      getReportedReviewIds(),
    ]);
    return rows
      .map(({ review, user, course }) => ({
        ...toReviewRow(review, user.name ?? user.certificateName ?? ''),
        courseTitleHt: course.titleHt ?? course.slug,
        courseTitleFr: course.titleFr ?? course.slug,
        reviewerEmail: user.email,
        reported: reported.has(review.id),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch (err) {
    console.error('[reviews] listReviewsForAdmin DB read failed, falling back to []:', err);
    return [];
  }
}
