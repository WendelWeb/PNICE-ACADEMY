'use server';

/**
 * Admin course-MODERATION server actions (Stage 1 — admin/studio boundary
 * closed for real). This file used to also hold the full course-AUTHORING
 * surface (create/update course, lesson/chapter CRUD, image CRUD, video
 * upload) gated only on the `courses.edit` capability with NO ownership
 * check — a platform admin (or anyone else holding `courses.edit`) could
 * mutate ANY teacher's course content directly. That surface is gone: course
 * authoring lives EXCLUSIVELY in the teacher studio now
 * (lib/teacher/studio-actions.ts), which gates every mutation through
 * `requireOwnedCourse` (ownership, not just role) and re-enters review on an
 * edit to an already-published course. The admin no longer authors courses —
 * not even the owner's own (see docs/superpowers/specs/2026-07-22-
 * marketplace-design.md's "aucun cas spécial").
 *
 * What's left here is genuinely MODERATION, not authoring: taking a live
 * course down (`unpublishCourseAction`). Approve/reject already live in
 * `lib/courses/review-actions.ts` (the "À valider" queue); delete now lives
 * owner-scoped in the studio (`deleteMyCourseAction`,
 * lib/teacher/studio-actions.ts) — an admin does not delete a third party's
 * course content, that decision belongs to the teacher who owns it. A direct
 * draft→published `publishCourseAction` used to live here too; it had no
 * legitimate use once submission→review→approve became the only path to
 * 'published', and was reachable only through `PublishBar.tsx` (deleted
 * alongside it — see git history if either is ever needed again).
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import * as writeOps from '@/lib/courses/write';
import type { AdminActor } from '@/lib/admin/data/types';

export type ContentResult = {
  ok: boolean;
  message?: string;
  slug?: string;
  count?: number;
};

/**
 * Task C3 fix: taking a course down is a MODERATION act, gated on
 * `teachers.review` (mirrors `lib/courses/review-actions.ts`'s
 * `requireReviewer`, duplicated locally rather than imported so this file's
 * auth story stays self-contained).
 */
async function requireModerator(): Promise<AdminActor> {
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

function fail(e: unknown): ContentResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

/**
 * Takedown of a currently-live course — the moderation power to pull ANY
 * teacher's published course from the public catalog (policy violation,
 * complaint, etc.), independent of that teacher's OWN self-service unpublish
 * in the studio (`unpublishMyCourseAction`, owner-scoped). Enrolled learners
 * keep access (see `writeOps.unpublishCourse`); the course itself goes back
 * to 'draft', so the owning teacher can fix it and resubmit.
 */
export async function unpublishCourseAction(slug: string): Promise<ContentResult> {
  try {
    const actor = await requireModerator();
    return await writeOps.unpublishCourse(slug, actor);
  } catch (e) {
    return fail(e);
  }
}
