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
 * `submitForReview`, `unpublishCourse`, `deleteCourse`, `getAdminCourse`) —
 * this module only adds the OWNERSHIP check (`requireOwnedCourse`) in front
 * of each call. Course authoring lives EXCLUSIVELY here since Stage 1 — the
 * admin's former, ownership-blind version of this same `writeOps.*` → action
 * shape (`lib/admin/content-actions.ts`'s `requireEditor()`) is gone.
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
import type { CoursePatch, LessonPatch, NewCourseInput, ChapterPatch } from '@/lib/courses/write';
import { getTeacherProfile, isApprovedTeacher, getTeacherBalanceCents, getPayoutThresholdCents, getWithdrawals } from './profile';
import { validatePayoutSettings, validatePlanPrice, isValidHttpUrl, normalizeHttpUrlInput, type PayoutMethod } from './apply-validation';
import { recordAudit } from '@/lib/admin/data/real/users';
import type { AdminActor } from '@/lib/admin/data/types';
import { createBunnyVideo, bunnyUploadConfigured, type BunnyUploadResult } from '@/lib/bunny/upload';
import { planOrganizedUpload } from '@/lib/bunny/organize';
import { sendEmail } from '@/lib/email/resend';
import { buildPayoutRequestedHtml } from '@/lib/email/templates';
import { hasCap } from '@/lib/admin/guard';

const T = schema;

export type StudioResult = {
  ok: boolean;
  message?: string;
  slug?: string;
  count?: number;
  /** Set by `addMyLessonAction` only (Task K2) — see `lib/courses/write.ts`'s `CourseWriteResult`. */
  lessonId?: string;
};
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
/**
 * WHO SKIPS THE RE-REVIEW GATE.
 *
 * Someone trusted to REVIEW other people's courses does not need their own
 * edits reviewed — that would be asking them to approve themselves. So the
 * exemption is tied to the `teachers.review` capability rather than to a
 * hardcoded account or a global "off" switch: the owner (and any admin given
 * that capability) edits a live course and the change is public immediately,
 * while an ordinary marketplace teacher still goes through moderation.
 *
 * Turning the gate off for EVERYONE would have been the shorter change and a
 * much worse one: a teacher could publish something clean, wait for approval,
 * then edit it into anything at all with nobody looking. The whole point of
 * the queue is that the published version is the reviewed version.
 *
 * Never throws — an unavailable capability check must not block a legitimate
 * save, so it resolves to "not exempt", which is the cautious direction.
 */
async function skipsReviewOnEdit(): Promise<boolean> {
  try {
    return await hasCap('teachers.review');
  } catch {
    return false;
  }
}

async function reenterReviewIfWasPublished(slug: string, ownerUserId: string, wasPublished: boolean): Promise<void> {
  if (!wasPublished) return;

  if (await skipsReviewOnEdit()) {
    // Stays published — but the public pages must still be told, or the edit
    // sits invisible behind a cached catalog while the studio shows it saved.
    writeOps.revalidateCoursePaths(slug);
    return;
  }

  await db
    .update(T.courses)
    .set({ status: 'pending_review', submittedAt: new Date(), hasUnpublishedChanges: true, updatedAt: new Date() })
    .where(and(eq(T.courses.slug, slug), eq(T.courses.ownerUserId, ownerUserId)));
  writeOps.revalidateCoursePaths(slug);
}

/* -------------------------------- course ------------------------------- */

/**
 * Optional course translation (Task: course-language, owner's ask: "quand
 * un prof veut enregistrer une nouvelle formation on doit lui demander s'il
 * veut la traduction"): the studio's "nouveau cours" form asks this UP
 * FRONT — `bilingual: true` (the default, unchanged behaviour) collects
 * title_ht/title_fr like before; `bilingual: false` collects ONE title in
 * `primaryLocale` and `writeOps.createCourse` mirrors it into both columns
 * (see `mirrorBilingualFields`). Validated here (not just at the TS-type
 * level) since this is a 'use server' entry point reachable with tampered
 * form data.
 */
export async function createMyCourseAction(
  input: Pick<NewCourseInput, 'title_ht' | 'title_fr' | 'priceCents' | 'bilingual' | 'primaryLocale'>,
): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor } = await requireApprovedTeacher();
    if (!input.title_ht?.trim() && !input.title_fr?.trim()) return { ok: false, message: 'title_required' };
    if (input.primaryLocale !== undefined && input.primaryLocale !== 'ht' && input.primaryLocale !== 'fr') {
      return { ok: false, message: 'invalid_primary_locale' };
    }
    // Owned by the signed-in teacher, not the site owner `createCourse`
    // would otherwise resolve — see the file header note on
    // `ownerUserIdOverride`. Code/slug are auto-generated (no admin-style
    // manual code field in the studio).
    return await writeOps.createCourse(
      {
        title_ht: input.title_ht,
        title_fr: input.title_fr,
        priceCents: input.priceCents,
        bilingual: input.bilingual,
        primaryLocale: input.primaryLocale,
      },
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

/**
 * Stage 1 fix (regression): course deletion had no reachable path anywhere
 * — the admin CMS's `deleteCourseAction` was the only caller of
 * `writeOps.deleteCourse` and lived behind the orphaned `PublishBar`, which
 * this stage removes along with it (see lib/admin/content-actions.ts's file
 * header). This is the real substitute, OWNER-SCOPED like every other
 * mutation here: `requireOwnedCourse(slug)` first, then
 * `writeOps.deleteCourse`'s existing, already-correct guards (blocked while
 * any enrollment exists, and the course's own CODE must be typed back to
 * confirm — same "type CODE to delete" pattern the old admin bar used).
 * A teacher who creates a course by mistake, or wants to remove a
 * zero-enrollment draft, now has a real way to do it — not from admin
 * (course deletion was never that; it's the owning teacher's call), from
 * their own studio.
 */
export async function deleteMyCourseAction(slug: string, confirmCode: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { actor } = await requireOwnedCourse(slug);
    return await writeOps.deleteCourse(slug, confirmCode, actor);
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

/* ------------------------------- chapters -------------------------------- */
/**
 * Task K1 (plan de cours complet) — owner-scoped wrappers for the curriculum
 * ops in lib/courses/write.ts, same shape as the lesson mutations just above:
 * `requireOwnedCourse(slug)` FIRST, then the write, then
 * `reenterReviewIfWasPublished` so an already-published course a teacher
 * edits re-enters moderation exactly like every other studio mutation.
 */

export async function createMyChapterAction(
  slug: string,
  input: { title_ht: string; title_fr: string },
): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.createChapter(slug, input, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function updateMyChapterAction(
  slug: string,
  chapterId: string,
  patch: ChapterPatch,
): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.updateChapter(slug, chapterId, patch, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMyChapterAction(slug: string, chapterId: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.deleteChapter(slug, chapterId, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function reorderMyChapterAction(
  slug: string,
  chapterId: string,
  dir: 'up' | 'down',
): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.reorderChapters(slug, chapterId, dir, actor);
    if (result.ok) await reenterReviewIfWasPublished(slug, userId, wasPublished);
    return result;
  } catch (e) {
    return fail(e);
  }
}

export async function moveMyLessonToChapterAction(
  slug: string,
  lessonId: string,
  chapterId: string | null,
): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const result = await writeOps.moveLessonToChapter(slug, lessonId, chapterId, actor);
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

/**
 * Autonomous direct-to-Bunny upload (studio path). `requireOwnedCourse(slug)`
 * runs FIRST — same ownership gate every other studio mutation uses — so a
 * teacher can only ever create a video object destined for a lesson in a
 * course THEY own; only after that check passes do we touch Bunny at all.
 * Returns the TUS upload-authorization payload for the browser (guid,
 * libraryId, signature, expire, tusEndpoint) — never the API key; see
 * lib/bunny/upload.ts's file header.
 *
 * AUTOMATIC ORGANIZATION (owner asked: "is it organized like Udemy, is it
 * all automatic?"): `lessonId` now resolves the real lesson + its chapter
 * via `planOrganizedUpload` (lib/bunny/organize.ts), which computes the
 * AUTHORITATIVE structured title ("PA-03 · Pati 2 · Leson 3 · ...") and
 * ensures/reuses the course's Bunny Collection — the client-supplied `title`
 * is used ONLY as a fallback if that resolution fails (lesson deleted mid-
 * upload, DB hiccup), never as the primary source once a real lesson row is
 * found. Organization is best-effort: any Bunny failure here still returns a
 * `{ title, collectionId: null }` plan, so the upload always proceeds.
 */
export async function createMyVideoUploadAction(
  slug: string,
  lessonId: string,
  title: string,
): Promise<BunnyUploadResult> {
  if (!dbConfigured()) return { ok: false, message: 'db_required' };
  try {
    await requireOwnedCourse(slug);
    if (!bunnyUploadConfigured()) return { ok: false, message: 'not_configured' };
    const plan = await planOrganizedUpload({ slug, lessonId, fallbackTitle: title });
    return await createBunnyVideo(plan.title, plan.collectionId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'error' };
  }
}

/* --------------------------------- images -------------------------------- */
/**
 * Each reads the course's CURRENT images (already ownership-checked via
 * `requireOwnedCourse`), computes the new array in JS, then calls
 * `writeOps.setCourseImages` — same shape as
 * `lib/admin/content-actions.ts`'s four image actions.
 *
 * URL VALIDATION (review fix): a stored image URL is rendered on every
 * public surface (catalogue card, sales page, checkout, dashboard) through
 * `next/image`, which THROWS at render time for a src that is neither
 * root-relative nor an absolute http(s) URL — so a scheme-less paste like
 * "monsite.com/foto.jpg" must never reach the DB. Same forgiveness the
 * resources editor applies (`normalizeHttpUrlInput` auto-prefixes https://
 * on bare domains), then the same `isValidHttpUrl` gate resources already
 * enforce at write time. Rejections use the `invalid_url` code the gallery
 * translates into plain teacher copy.
 */
export async function setMyMainImageAction(slug: string, url: string): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor, wasPublished } = await requireOwnedCourse(slug);
    const clean = normalizeHttpUrlInput(url);
    if (clean && !isValidHttpUrl(clean)) return { ok: false, message: 'invalid_url' };
    const course = await writeOps.getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const secondary = course.secondaryImages.map((i) => ({ url: i.url, alt: i.alt }));
    const result = await writeOps.setCourseImages(slug, { main: clean || null, secondary }, actor);
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
    const clean = normalizeHttpUrlInput(url);
    if (!clean) return { ok: false, message: 'empty' };
    if (!isValidHttpUrl(clean)) return { ok: false, message: 'invalid_url' };
    const course = await writeOps.getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const secondary = [...course.secondaryImages.map((i) => ({ url: i.url, alt: i.alt })), { url: clean, alt: alt.trim() }];
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

/* --------------------------------- plan ----------------------------------- */

/**
 * Task: per-teacher plan pricing. Before this, only SQL could change a
 * teacher's own monthly subscription price (gap flagged since C3) — this is
 * the studio's "Mon abonnement" write path. `requireApprovedTeacher()` FIRST
 * (same gate every other studio action uses), then upsert the CURRENT
 * teacher's OWN `teacher_plans` row — create one if they don't have one yet,
 * otherwise update theirs. OWNER-SCOPED (the one property every other choice
 * here is subordinate to, mirrors `updateMyPayoutSettingsAction`'s header):
 * `userId` is resolved from the SIGNED-IN session, never a caller-supplied
 * id, and the update's `where` is scoped to BOTH the existing row's own id
 * AND that same `userId` — a teacher can never reach another owner's plan
 * row, whether by upsert or update.
 *
 * `titleHt`/`titleFr`/`includesAll` are optional: omitted on first save, a
 * new plan is created with no custom title (the studio panel falls back to
 * displaying the platform's generic "Abonnement mensuel" copy) and
 * `includesAll = true` (today's only supported shape — a course-scoped
 * subset plan is unused, see `teacher_plans.course_slugs`'s doc comment).
 */
export async function updateMyPlanAction(input: {
  priceCentsMonthly: number;
  titleHt?: string;
  titleFr?: string;
  includesAll?: boolean;
}): Promise<StudioResult> {
  if (!dbConfigured()) return dbRequired();
  try {
    const { userId, actor } = await requireApprovedTeacher();

    const error = validatePlanPrice(input.priceCentsMonthly);
    if (error) return { ok: false, message: error };

    const [existing] = await db
      .select({ id: T.teacherPlans.id })
      .from(T.teacherPlans)
      .where(eq(T.teacherPlans.ownerUserId, userId))
      .limit(1);

    if (existing) {
      // Partial update: title/includesAll are only overwritten when the
      // caller explicitly passes them — the studio's price-only form
      // (today's only caller) must never silently wipe an already-set title.
      await db
        .update(T.teacherPlans)
        .set({
          priceCentsMonthly: input.priceCentsMonthly,
          ...(input.titleHt !== undefined ? { titleHt: input.titleHt.trim() || null } : {}),
          ...(input.titleFr !== undefined ? { titleFr: input.titleFr.trim() || null } : {}),
          ...(input.includesAll !== undefined ? { includesAll: input.includesAll } : {}),
          status: 'active',
          updatedAt: new Date(),
        })
        .where(and(eq(T.teacherPlans.id, existing.id), eq(T.teacherPlans.ownerUserId, userId)));
    } else {
      await db.insert(T.teacherPlans).values({
        ownerUserId: userId,
        titleHt: input.titleHt?.trim() || null,
        titleFr: input.titleFr?.trim() || null,
        priceCentsMonthly: input.priceCentsMonthly,
        includesAll: input.includesAll ?? true,
        status: 'active',
      });
    }

    await recordAudit({ action: 'update_my_plan', userId, admin: actor, detail: String(input.priceCentsMonthly) });
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

    // Stage 7 — admin inbound signal: best-effort, AFTER the pending row is
    // already durably inserted, so a notification-write hiccup can never
    // fail (or double-run) the request itself.
    try {
      await db.insert(T.adminNotifications).values({
        kind: 'withdrawal_request',
        severity: 'info',
        userId,
        userName: profile.displayName,
        amountCents,
        detail: profile.payoutMethod,
        read: false,
      });
    } catch (notifErr) {
      console.error('[teacher/studio-actions] requestWithdrawalAction notification insert failed (request already recorded):', notifErr);
    }

    // Stage 6: payout-requested confirmation to the teacher — best-effort
    // AFTER the pending row is durably inserted; an email failure must never
    // fail the request (sendEmail is env-gated + never-throws).
    try {
      const [user] = await db
        .select({ email: T.users.email, name: T.users.name, localePref: T.users.localePref })
        .from(T.users)
        .where(eq(T.users.id, userId))
        .limit(1);
      if (user?.email) {
        const confirmation = buildPayoutRequestedHtml({
          locale: user.localePref === 'fr' ? 'fr' : 'ht',
          name: user.name,
          amountCents,
          method: profile.payoutMethod,
        });
        await sendEmail({ to: user.email, subject: confirmation.subject, html: confirmation.html, text: confirmation.text });
      }
    } catch (emailErr) {
      console.error('[teacher/studio-actions] payout-requested email failed (request already recorded):', emailErr);
    }
    return { ok: true };
  } catch (e) {
    console.error('[teacher/studio-actions] requestWithdrawalAction failed:', e);
    return { ok: false, message: 'error' };
  }
}
