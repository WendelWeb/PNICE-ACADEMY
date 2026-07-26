'use server';

/**
 * lib/teacher/studio-actions.ts — the teacher studio's WRITE path (Task
 * C3-T4). Every export here is called from the studio pages/components under
 * app/[locale]/(site)/enseigner/studio/ — the approved-teacher-only area
 * where a teacher manages THEIR OWN courses.
 *
 * SECURITY CORE — read this before touching anything below: every mutation
 * that targets an existing course/lesson/image goes through
 * `requireOwnedCourse(slug)`, which (a) requires an APPROVED teacher profile
 * and (b) loads the course's `owner_user_id` and throws unless it equals the
 * current teacher's internal `users.id`:
 *
 *   if (course.ownerUserId !== userId) throw new Error('forbidden');
 *
 * A teacher editing, submitting, or otherwise mutating another teacher's
 * course must ALWAYS resolve to `{ ok: false, message: 'forbidden' }` here —
 * never a silent success on the wrong row. This is the one property every
 * other design choice in this file is subordinate to.
 *
 * REUSE, NOT DUPLICATION: the actual DB writes are `lib/courses/write.ts`'s
 * existing, already-audited functions (`updateCourse`, `addLesson`,
 * `updateLesson`, `deleteLesson`, `reorderLessons`, `setCourseImages`,
 * `submitForReview`, `unpublishCourse`, `getAdminCourse`) — this module only
 * adds the OWNERSHIP check in front of each call (mirrors
 * `lib/admin/content-actions.ts`'s `requireEditor()` → `writeOps.*` shape,
 * substituting a per-course ownership check for the admin-role check).
 * `createCourse` gained an optional `ownerUserIdOverride` third param
 * (Task C3-T4) specifically so `createMyCourseAction` can own the new row
 * as the SIGNED-IN TEACHER instead of the site owner the admin CMS resolves.
 *
 * TEACHERS CANNOT SELF-PUBLISH: `submitMyCourseForReviewAction` only ever
 * calls `writeOps.submitForReview` (draft/rejected → pending_review) — there
 * is NO path here to `writeOps.publishCourse`/`approveCourse` (admin-only,
 * Task C3-T3, `/admin/cours`). A teacher's course becomes public only when
 * an admin approves it.
 *
 * ENV-GATED, same choke point as every other write module (`dbConfigured()`
 * checked FIRST, before `auth()`/`db`): no DATABASE_URL ⇒
 * `{ ok: false, message: 'db_required' }`, never throws.
 */
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import * as writeOps from '@/lib/courses/write';
import type { CoursePatch, LessonPatch, NewCourseInput } from '@/lib/courses/write';
import { getTeacherProfile, isApprovedTeacher, getTeacherBalanceCents, getPayoutThresholdCents, getWithdrawals } from './profile';
import { validatePayoutSettings, type PayoutMethod } from './apply-validation';
import { recordAudit } from '@/lib/admin/data/real/users';
import type { AdminActor } from '@/lib/admin/data/types';

const T = schema;

export type StudioResult = { ok: boolean; message?: string; slug?: string; count?: number };
export type WithdrawalResult = { ok: boolean; message?: string };

function dbRequired(): StudioResult {
  return { ok: false, message: 'db_required' };
}

function fail(e: unknown): StudioResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

/**
 * Resolves the current signed-in user to their internal `users.id` +
 * requires an APPROVED `teacher_profiles` row. Throws `unauthorized`
 * (signed out / no `users` row) or `forbidden` (no profile, or not
 * approved) — every exported action below catches this via `fail()`.
 */
async function requireApprovedTeacher(): Promise<{ userId: string; actor: AdminActor }> {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error('unauthorized');
  const userId = await resolveUserId(clerkId);
  if (!userId) throw new Error('unauthorized');
  const approved = await isApprovedTeacher(userId);
  if (!approved) throw new Error('forbidden');
  const profile = await getTeacherProfile(userId);
  return { userId, actor: { id: userId, name: profile?.displayName || 'Anseyan' } };
}

/**
 * THE SECURITY CORE (see file header): requires an approved teacher AND that
 * `slug` is a course they own. Every mutation on an EXISTING course/lesson/
 * image set calls this first. Also returns `wasPublished` (the course's
 * status AT THE MOMENT OF THE CHECK, before any write below runs) — every
 * caller feeds this into `reenterReviewIfWasPublished` after its write
 * succeeds (see that function's header for why).
 */
async function requireOwnedCourse(
  slug: string,
): Promise<{ userId: string; actor: AdminActor; wasPublished: boolean }> {
  const { userId, actor } = await requireApprovedTeacher();
  const [course] = await db
    .select({ ownerUserId: T.courses.ownerUserId, status: T.courses.status })
    .from(T.courses)
    .where(eq(T.courses.slug, slug))
    .limit(1);
  if (!course) throw new Error('not_found');
  if (course.ownerUserId !== userId) throw new Error('forbidden');
  return { userId, actor, wasPublished: course.status === 'published' };
}

/**
 * RE-REVIEW GATE (Task C3-T4 fix — binding marketplace decision: "admin
 * reviews EVERY course change before it's public"). Before this fix, a
 * teacher editing an already-PUBLISHED course applied their edit immediately
 * and it stayed live with no re-approval — every studio mutation below calls
 * this AFTER its write succeeds so that's no longer possible: if the course
 * WAS 'published' at the start of the action (per `requireOwnedCourse`'s
 * `wasPublished`), it is pulled back into 'pending_review' (same
 * submittedAt/hasUnpublishedChanges bookkeeping `writeOps.submitForReview`
 * uses) and the public catalog paths are revalidated, so the now-unpublished
 * course actually disappears from the public site instead of lingering in
 * ISR cache until the next ~ window.
 *
 * `submitMyCourseForReviewAction`/`unpublishMyCourseAction` do NOT call this
 * — they already own the status transition for their own paths (draft/
 * rejected → pending_review, published → draft) and must not be double-
 * applied on top of it.
 *
 * Scoped by slug AND ownerUserId (belt-and-suspenders on top of the caller's
 * `requireOwnedCourse` check) — this must never touch a course this teacher
 * doesn't own.
 *
 * v1 (deliberate, see the plan): this takes the course OFFLINE for the
 * duration of the re-review — there is no separate draft/published fork (see
 * lib/courses/write.ts's file header), so "keep the last-approved version
 * live while the pending edit is reviewed" would need real content
 * versioning. That's a v2 follow-up; taking the course down until
 * re-approved is the safe, moderation-correct default for v1. The existing
 * `teach.studio.status.pending_review` badge + `pendingReviewNote` copy
 * ("En cours de validation par notre équipe." / Kreyòl equivalent) already
 * surfaces this to the teacher the moment the page refreshes post-edit — no
 * new i18n key needed for that.
 */
async function reenterReviewIfWasPublished(slug: string, ownerUserId: string, wasPublished: boolean): Promise<void> {
  if (!wasPublished) return;
  await db
    .update(T.courses)
    .set({ status: 'pending_review', submittedAt: new Date(), hasUnpublishedChanges: true, updatedAt: new Date() })
    .where(and(eq(T.courses.slug, slug), eq(T.courses.ownerUserId, ownerUserId)));
  writeOps.revalidateCoursePaths(slug);
}

/* -------------------------------- course ------------------------------- */

export async function createMyCourseAction(
  input: Pick<NewCourseInput, 'title_ht' | 'title_fr' | 'priceCents'>,
): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor } = await requireApprovedTeacher();
    if (!input.title_ht?.trim() && !input.title_fr?.trim()) return { ok: false, message: 'title_required' };
    // Owned by the signed-in teacher, not the site owner `createCourse`
    // would otherwise resolve — see the file header note on
    // `ownerUserIdOverride`. Code/slug are auto-generated (no admin-style
    // manual code field in the studio).
    return await writeOps.createCourse(
      { title_ht: input.title_ht, title_fr: input.title_fr, priceCents: input.priceCents },
      actor,
      userId,
    );
  } catch (e) {
    return fail(e);
  }
}

export async function updateMyCourseAction(slug: string, patch: CoursePatch): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.updateCourse(slug, patch, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

/**
 * A teacher may only SUBMIT (draft/rejected → pending_review) — never
 * publish directly (see file header). Admin approval (Task C3-T3,
 * `/admin/cours`) is the only path to `published`.
 */
export async function submitMyCourseForReviewAction(slug: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { actor } = await requireOwnedCourse(slug);
    const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
    if (!current) return { ok: false, message: 'not_found' };
    if (current.status !== 'draft' && current.status !== 'rejected') {
      return { ok: false, message: 'invalid_status' };
    }
    return await writeOps.submitForReview(slug, actor);
  } catch (e) {
    return fail(e);
  }
}

/** My published course → draft (enrolled learners keep access — see writeOps.unpublishCourse). */
export async function unpublishMyCourseAction(slug: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { actor } = await requireOwnedCourse(slug);
    const [current] = await db.select({ status: T.courses.status }).from(T.courses).where(eq(T.courses.slug, slug)).limit(1);
    if (!current) return { ok: false, message: 'not_found' };
    if (current.status !== 'published') return { ok: false, message: 'invalid_status' };
    return await writeOps.unpublishCourse(slug, actor);
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------- lessons ------------------------------- */

export async function addMyLessonAction(slug: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.addLesson(slug, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function updateMyLessonAction(slug: string, lessonId: string, patch: LessonPatch): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.updateLesson(slug, lessonId, patch, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMyLessonAction(slug: string, lessonId: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.deleteLesson(slug, lessonId, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function moveMyLessonAction(slug: string, lessonId: string, dir: 'up' | 'down'): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.reorderLessons(slug, lessonId, dir, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

/** Stub bunny-id check (mirrors `lib/admin/content-actions.ts`'s admin
 *  version) — gated on APPROVED TEACHER, not admin role, so it works from
 *  the studio. No course-ownership check needed: it validates a raw video
 *  id string, it doesn't touch any row. */
export async function validateMyBunnyVideoAction(videoId: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    await requireApprovedTeacher();
    if (!videoId.trim()) return { ok: false, message: 'empty' };
    if (!process.env.BUNNY_STREAM_API_KEY) return { ok: true, message: 'unvalidated_mock' };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- images -------------------------------- */
/**
 * Each reads the course's CURRENT images (already ownership-checked via
 * `requireOwnedCourse`), computes the new array in JS, then calls
 * `writeOps.setCourseImages` — same shape as
 * `lib/admin/content-actions.ts`'s four image actions.
 */
export async function setMyMainImageAction(slug: string, url: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const course = await writeOps.getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const secondary = course.secondaryImages.map((i) => ({ url: i.url, alt: i.alt }));
    const result = await writeOps.setCourseImages(slug, { main: url.trim() || null, secondary }, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function addMySecondaryImageAction(slug: string, url: string, alt: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    if (!url.trim()) return { ok: false, message: 'empty' };
    const course = await writeOps.getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const secondary = [...course.secondaryImages.map((i) => ({ url: i.url, alt: i.alt })), { url: url.trim(), alt: alt.trim() }];
    const result = await writeOps.setCourseImages(slug, { main: course.mainImage, secondary }, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function removeMySecondaryImageAction(slug: string, imageId: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const course = await writeOps.getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const secondary = course.secondaryImages.filter((i) => i.id !== imageId).map((i) => ({ url: i.url, alt: i.alt }));
    const result = await writeOps.setCourseImages(slug, { main: course.mainImage, secondary }, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function moveMySecondaryImageAction(slug: string, imageId: string, dir: 'up' | 'down'): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const course = await writeOps.getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const i = course.secondaryImages.findIndex((x) => x.id === imageId);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= course.secondaryImages.length) return { ok: false, message: 'invalid_move' };
    const reordered = [...course.secondaryImages];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const secondary = reordered.map((im) => ({ url: im.url, alt: im.alt }));
    const result = await writeOps.setCourseImages(slug, { main: course.mainImage, secondary }, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

/* ---------------------------- payout settings ----------------------------- */

/**
 * Task C3 fix: an APPROVED teacher (incl. the owner) had NO in-app way to
 * set/change `teacher_profiles.payout_method`/`payout_destination` once
 * approved — the apply wizard refuses to re-run for an already-approved
 * profile (`applyAsTeacherAction`), and `requestWithdrawalAction` above hard-
 * refuses without both fields set (`no_payout_method`). This is the missing
 * write path, reached from the studio's payout-settings card.
 *
 * OWNER-SCOPED (the one property every other choice here is subordinate to):
 * `requireApprovedTeacher()` resolves `userId` from the SIGNED-IN Clerk
 * session — there is no id parameter a caller could substitute to target
 * another teacher's row. The `where` clause below is scoped to that same
 * resolved `userId`, never a value from the arguments.
 *
 * Validation reuses `apply-validation.ts`'s `validatePayoutSettings` — the
 * EXACT SAME rule the apply wizard enforces (method allowlist + destination
 * required/max-length) — so this can never write a value the original apply
 * flow would have rejected.
 */
export async function updateMyPayoutSettingsAction(
  payoutMethod: PayoutMethod,
  payoutDestination: string,
): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor } = await requireApprovedTeacher();

    const error = validatePayoutSettings(payoutMethod, payoutDestination);
    if (error) return { ok: false, message: error };
    const destination = payoutDestination.trim();

    await db
      .update(T.teacherProfiles)
      .set({ payoutMethod, payoutDestination: destination, updatedAt: new Date() })
      .where(eq(T.teacherProfiles.userId, userId));

    await recordAudit({ action: 'update_payout_settings', userId, admin: actor, detail: payoutMethod });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- withdrawal ------------------------------ */

/**
 * A teacher requests a payout of their balance. GUARDS, in order:
 *   1. signed-in + APPROVED teacher profile (has a payout method+destination)
 *   2. `amountCents` a positive integer
 *   3. no existing `pending` withdrawal_requests row for this teacher
 *   4. `amountCents >= platform_settings.payout_threshold_cents`
 *   5. `amountCents <= getTeacherBalanceCents(userId)` (SUM(net_cents))
 * Passing all five inserts a `pending` row snapshotting the CURRENT
 * payout method/destination from `teacher_profiles` (a later profile edit
 * must never silently change where an already-requested payout is sent).
 */
export async function requestWithdrawalAction(amountCents: number): Promise<WithdrawalResult> {
  if (!dbConfigured()) return { ok: false, message: 'db_required' };
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return { ok: false, message: 'unauthorized' };
    const userId = await resolveUserId(clerkId);
    if (!userId) return { ok: false, message: 'unauthorized' };

    const profile = await getTeacherProfile(userId);
    if (!profile || profile.status !== 'approved') return { ok: false, message: 'forbidden' };
    if (!profile.payoutMethod || !profile.payoutDestination) return { ok: false, message: 'no_payout_method' };

    if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, message: 'invalid_amount' };

    const [balanceCents, thresholdCents, withdrawals] = await Promise.all([
      getTeacherBalanceCents(userId),
      getPayoutThresholdCents(),
      getWithdrawals(userId),
    ]);

    if (withdrawals.some((w) => w.status === 'pending')) return { ok: false, message: 'pending_exists' };
    if (amountCents < thresholdCents) return { ok: false, message: 'below_threshold' };
    if (amountCents > balanceCents) return { ok: false, message: 'insufficient_balance' };

    // The `withdrawals.some(...)` check above is a pre-check for good UX
    // (fast, clear rejection) — it is NOT the real guard: two concurrent
    // calls can both pass it before either inserts, both scheduling a
    // 'pending' row that together exceed the teacher's balance. The DB's
    // `withdrawal_one_pending_per_teacher` partial unique index
    // (db/schema.ts) is the actual guard — it lets at most one 'pending' row
    // per teacher exist, full stop. A concurrent second insert hits that
    // constraint and throws; caught here and reported the same way the
    // pre-check above reports it, since to the caller it's the same
    // situation ("you already have one pending").
    try {
      await db.insert(T.withdrawalRequests).values({
        teacherUserId: userId,
        amountCents,
        method: profile.payoutMethod,
        destinationSnapshot: profile.payoutDestination,
        status: 'pending',
      });
    } catch (insertErr) {
      console.error('[teacher/studio-actions] requestWithdrawalAction insert failed:', insertErr);
      return { ok: false, message: 'pending_exists' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[teacher/studio-actions] requestWithdrawalAction failed:', e);
    return { ok: false, message: 'error' };
  }
}
