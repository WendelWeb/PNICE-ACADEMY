'use server';

/**
 * Teacher-profile moderation server actions (Task C3-T3, `/admin/enseignants`).
 * Thin auth+wiring layer over `lib/teacher/admin.ts` — mirrors the
 * established `lib/admin/actions.ts` → `lib/admin/data/real/users.ts`
 * division of labour: `requireAdmin` here (Clerk role + `teachers.review`
 * capability check), the real Drizzle write + `recordAudit` there.
 *
 * Every action is wrapped in try/catch (`fail(e)`): an unauthenticated/
 * unauthorized caller, or a DB error surfaced as `{ ok:false,
 * message:'db_required' }` by `lib/teacher/admin.ts`, both resolve to a
 * plain `TeacherActionResult` — never a thrown/crashed server action.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import * as adminOps from './admin';
import type { AdminActor } from '@/lib/admin/data/types';

export type TeacherActionResult = { ok: boolean; message?: string };

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

function fail(e: unknown): TeacherActionResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

export async function approveTeacherAction(userId: string): Promise<TeacherActionResult> {
  try {
    const admin = await requireAdmin();
    return await adminOps.approveTeacherProfile({ userId, admin });
  } catch (e) {
    return fail(e);
  }
}

export async function rejectTeacherAction(userId: string, note: string): Promise<TeacherActionResult> {
  try {
    if (!note.trim()) return { ok: false, message: 'note_required' };
    const admin = await requireAdmin();
    return await adminOps.rejectTeacherProfile({ userId, note: note.trim(), admin });
  } catch (e) {
    return fail(e);
  }
}

export async function suspendTeacherAction(userId: string, reason: string): Promise<TeacherActionResult> {
  try {
    if (!reason.trim()) return { ok: false, message: 'reason_required' };
    const admin = await requireAdmin();
    return await adminOps.suspendTeacherProfile({ userId, reason: reason.trim(), admin });
  } catch (e) {
    return fail(e);
  }
}

export async function reactivateTeacherAction(userId: string): Promise<TeacherActionResult> {
  try {
    const admin = await requireAdmin();
    return await adminOps.reactivateTeacherProfile({ userId, admin });
  } catch (e) {
    return fail(e);
  }
}

/** Sidebar badge: count of `pending` teacher applications (Stage 7). Mirrors
 *  `getSupportBadgeAction`'s shape — any auth/capability failure degrades to
 *  0, never throws, so the sidebar renders with no badge instead of crashing. */
export async function getTeacherApplicationsBadgeAction(): Promise<number> {
  try {
    await requireAdmin();
    return (await adminOps.countTeacherProfilesByStatus()).pending;
  } catch {
    return 0;
  }
}
