'use server';

/**
 * Course-review queue server actions (Task C3-T3, the "À valider" tab on
 * `/admin/cours`). Thin auth+wiring layer over `lib/courses/write.ts`'s
 * `approveCourse`/`rejectCourse` — mirrors `lib/admin/content-actions.ts`'s
 * `requireEditor` pattern, but gated on the moderation capability
 * (`teachers.review`) instead of `courses.edit`: the CMS editor's direct
 * publish/unpublish stays owner-only, this queue is the ADMIN review step.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import * as writeOps from './write';
import type { AdminActor } from '@/lib/admin/data/types';

export type ReviewResult = { ok: boolean; message?: string };

async function requireReviewer(): Promise<AdminActor> {
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

function fail(e: unknown): ReviewResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

export async function approveCourseAction(slug: string): Promise<ReviewResult> {
  try {
    const actor = await requireReviewer();
    return await writeOps.approveCourse(slug, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function rejectCourseAction(slug: string, note: string): Promise<ReviewResult> {
  try {
    if (!note.trim()) return { ok: false, message: 'note_required' };
    const actor = await requireReviewer();
    return await writeOps.rejectCourse(slug, note.trim(), actor);
  } catch (e) {
    return fail(e);
  }
}

/** Sidebar badge: count of courses `pending_review` (Stage 7). Mirrors
 *  `getSupportBadgeAction`'s shape — any auth/capability failure degrades to
 *  0, never throws, so the sidebar renders with no badge instead of crashing. */
export async function getCourseReviewBadgeAction(): Promise<number> {
  try {
    await requireReviewer();
    return await writeOps.countCoursesPendingReview();
  } catch {
    return 0;
  }
}
