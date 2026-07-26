'use server';

/**
 * lib/reviews/actions.ts — course-review WRITE path (Task C3-T6). Thin
 * 'use server' layer over lib/reviews/reviews.ts's reads, following the same
 * division of labour as lib/teacher/admin-actions.ts over lib/teacher/admin.ts:
 * auth/authorization + try/catch live here, the Drizzle reads live there.
 *
 * THE INTEGRITY GATE (binding — see the C3 plan's "Ratings v1" decision): a
 * learner may only rate a course they're actually enrolled in or subscribed
 * to. `submitReviewAction` enforces this SERVER-SIDE via
 * `hasCourseAccess(clerkId, courseSlug)` — the exact same check the lesson
 * player itself uses to gate video access — never trusting whatever the
 * client claims. A non-enrolled signed-in user calling this action directly
 * (bypassing the UI) still gets rejected with `{ ok: false, message:
 * 'not_enrolled' }`.
 *
 * ONE REVIEW PER LEARNER PER COURSE, EDITABLE: `course_reviews` has a
 * `unique(course_slug, user_id)` constraint (db/schema.ts) and the insert
 * below upserts against it (`onConflictDoUpdate`) — a learner re-rating a
 * course they already rated updates their existing row in place (new stars/
 * comment, status reset to 'published') rather than creating a second row.
 *
 * REPORTING, ZERO SCHEMA CHANGE: `course_reviews` has no "reported" column
 * (see db/schema.ts's header — the spec only asks for `status`
 * 'published'|'removed'). `reportReviewAction` reuses the EXISTING support-
 * ticket queue instead (`createTicket`, type 'other') — the exact same
 * "zero schema change" convention lib/site-actions-public.ts's
 * `registerTeachInterestAction` already established for a different
 * system-generated ticket. The ticket message embeds a `[review:<id>]` tag
 * that lib/reviews/reviews.ts's `getReportedReviewIds` parses back out, so
 * the admin queue can show which reviews are currently flagged without any
 * new table.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { revalidateCoursePaths } from '@/lib/courses/write';
import { clerkEnabled } from '@/lib/clerk';
import { hasCourseAccess, resolveUserId } from '@/lib/learner/access';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { createTicket } from '@/lib/admin/data';
import { recordAudit } from '@/lib/admin/data/real/users';
import { getReviewById, getMyReview, clampStars, COMMENT_MAX_LENGTH, type ReviewRow } from './reviews';
import type { AdminActor } from '@/lib/admin/data/types';

const T = schema;

export type ReviewActionResult = { ok: boolean; message?: string };

export type MyReviewStatus = { signedIn: boolean; enrolled: boolean; myReview: ReviewRow | null };

/**
 * Read-only RPC for the client-side rating widget (components/reviews/
 * RatingWidget.tsx). The course sales page itself stays fully static
 * (`generateStaticParams` + `revalidate = 300`, like the rest of
 * formations/[slug]/page.tsx — see that file: personalization there is
 * always done client-side, e.g. `AuthCta`'s `SignedIn`/`SignedOut`, never by
 * calling `auth()` in the page's own server component, which would force it
 * dynamic for every visitor). The widget calls this on mount instead, so
 * only the widget itself is personalized — never the surrounding page.
 * GATED + NEVER-THROW: no DATABASE_URL, Clerk disabled, or signed out ⇒ the
 * neutral `{ signedIn: false, enrolled: false, myReview: null }`.
 */
export async function getMyReviewStatusAction(courseSlug: string): Promise<MyReviewStatus> {
  const empty: MyReviewStatus = { signedIn: false, enrolled: false, myReview: null };
  if (!dbConfigured()) return empty;
  try {
    const { userId: clerkId } = clerkEnabled ? await auth() : { userId: null };
    if (!clerkId) return empty;

    const [enrolled, userId] = await Promise.all([
      hasCourseAccess(clerkId, courseSlug),
      resolveUserId(clerkId),
    ]);
    const myReview = userId ? await getMyReview(userId, courseSlug) : null;
    return { signedIn: true, enrolled, myReview };
  } catch (e) {
    console.error('[reviews/actions] getMyReviewStatusAction failed:', e);
    return empty;
  }
}

/**
 * A signed-in, ENROLLED learner rates (or edits their existing rating of) a
 * course 1..5 with an optional comment. See the file header for the full
 * integrity-gate + upsert contract.
 */
export async function submitReviewAction(
  courseSlug: string,
  stars: number,
  comment?: string | null,
): Promise<ReviewActionResult> {
  if (!dbConfigured()) return { ok: false, message: 'db_required' };

  try {
    const { userId: clerkId } = clerkEnabled ? await auth() : { userId: null };
    if (!clerkId) return { ok: false, message: 'unauthorized' };

    const clamped = clampStars(stars);
    if (clamped === null) return { ok: false, message: 'invalid_stars' };

    const trimmedComment = comment?.trim() || null;
    if (trimmedComment && trimmedComment.length > COMMENT_MAX_LENGTH) {
      return { ok: false, message: 'comment_too_long' };
    }

    // THE INTEGRITY GATE — see file header. Only an enrolled/subscribed
    // learner may rate; never trust the client's own claim of access.
    const allowed = await hasCourseAccess(clerkId, courseSlug);
    if (!allowed) return { ok: false, message: 'not_enrolled' };

    const userId = await resolveUserId(clerkId);
    if (!userId) return { ok: false, message: 'unauthorized' };

    const now = new Date();
    await db
      .insert(T.courseReviews)
      .values({
        courseSlug,
        userId,
        stars: clamped,
        comment: trimmedComment,
        status: 'published',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [T.courseReviews.courseSlug, T.courseReviews.userId],
        set: { stars: clamped, comment: trimmedComment, status: 'published', updatedAt: now },
      });

    revalidateCoursePaths(courseSlug);
    return { ok: true };
  } catch (e) {
    console.error('[reviews/actions] submitReviewAction failed:', e);
    return { ok: false, message: 'error' };
  }
}

/**
 * Any signed-in user flags a review for admin attention. Files a support
 * ticket (type 'other', tagged `[review:<id>]`) rather than mutating
 * `course_reviews` itself — see file header. Idempotent-ish: does not
 * de-duplicate repeat reports of the same review (each is a distinct signal
 * to admin), but a removed/unknown review is rejected up front.
 */
export async function reportReviewAction(reviewId: string): Promise<ReviewActionResult> {
  if (!dbConfigured()) return { ok: false, message: 'db_required' };

  try {
    const { userId: clerkId } = clerkEnabled ? await auth() : { userId: null };
    if (!clerkId) return { ok: false, message: 'unauthorized' };

    const review = await getReviewById(reviewId);
    if (!review || review.status !== 'published') return { ok: false, message: 'not_found' };

    const client = await clerkClient();
    const user = await client.users.getUser(clerkId);
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Utilisateur';
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      '—';

    await createTicket({
      userId: clerkId,
      userName: name,
      userEmail: email,
      type: 'other',
      subject: 'Avis siyalé',
      message:
        `Yon itilizatè siyale yon avis sou fòmasyon "${review.courseSlug}" ` +
        `(${review.stars}★${review.comment ? ` — "${review.comment}"` : ''}). ` +
        `[review:${review.id}]`,
    });
    return { ok: true };
  } catch (e) {
    console.error('[reviews/actions] reportReviewAction failed:', e);
    return { ok: false, message: 'error' };
  }
}

/** Mirrors lib/teacher/admin-actions.ts's `requireAdmin` exactly: Clerk role +
 *  the `teachers.review` capability (reused rather than adding a dedicated
 *  `reviews.moderate` cap — same moderators already handle the teacher/course
 *  review queues). */
async function requireAdmin(): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'teachers.review')) throw new Error('forbidden');
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { id: userId, name };
}

/**
 * Admin-only: remove a reported (or otherwise problematic) review —
 * `status → 'removed'` + an audit row. Requires the `teachers.review`
 * capability (see requireAdmin above).
 */
export async function removeReviewAction(reviewId: string, reason: string): Promise<ReviewActionResult> {
  if (!dbConfigured()) return { ok: false, message: 'db_required' };
  if (!reason.trim()) return { ok: false, message: 'reason_required' };

  try {
    const admin = await requireAdmin();

    const review = await getReviewById(reviewId);
    if (!review) return { ok: false, message: 'not_found' };
    if (review.status === 'removed') return { ok: true }; // already removed — idempotent

    await db
      .update(T.courseReviews)
      .set({ status: 'removed', updatedAt: new Date() })
      .where(eq(T.courseReviews.id, reviewId));

    await recordAudit({
      action: 'remove_review',
      userId: review.userId,
      admin,
      detail: `course:${review.courseSlug}`,
      reason: reason.trim(),
    });

    revalidateCoursePaths(review.courseSlug);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'error' };
  }
}
