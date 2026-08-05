'use server';

/**
 * Admin withdrawal-queue server actions (Task C3-T5, `/admin/retraits`). Thin
 * auth+wiring layer over `lib/teacher/payouts.ts` — mirrors the established
 * `lib/teacher/admin-actions.ts` → `lib/teacher/admin.ts` division of labour:
 * `requireAdmin` here (Clerk role + `payouts.process` capability check), the
 * real Drizzle write + `recordAudit` there.
 *
 * Every action is wrapped in try/catch (`fail(e)`): an unauthenticated/
 * unauthorized caller, or a DB error surfaced as `{ ok:false,
 * message:'db_required' }` by `lib/teacher/payouts.ts`, both resolve to a
 * plain `PayoutActionResult` — never a thrown/crashed server action.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import * as payoutOps from './payouts';
import type { AdminActor } from '@/lib/admin/data/types';

export type PayoutActionResult = { ok: boolean; message?: string };

async function requireAdmin(): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'payouts.process')) throw new Error('forbidden');
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { id: userId, name };
}

function fail(e: unknown): PayoutActionResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

export async function markWithdrawalPaidAction(id: string, reference: string): Promise<PayoutActionResult> {
  try {
    if (!reference.trim()) return { ok: false, message: 'reference_required' };
    const admin = await requireAdmin();
    return await payoutOps.markWithdrawalPaid({ id, reference: reference.trim(), admin });
  } catch (e) {
    return fail(e);
  }
}

export async function rejectWithdrawalAction(id: string, note: string): Promise<PayoutActionResult> {
  try {
    if (!note.trim()) return { ok: false, message: 'note_required' };
    const admin = await requireAdmin();
    return await payoutOps.rejectWithdrawal({ id, note: note.trim(), admin });
  } catch (e) {
    return fail(e);
  }
}

/** Sidebar badge: count of `pending` withdrawal requests (Stage 7). Mirrors
 *  `getSupportBadgeAction`'s shape — any auth/capability failure degrades to
 *  0, never throws, so the sidebar renders with no badge instead of crashing. */
export async function getWithdrawalsBadgeAction(): Promise<number> {
  try {
    await requireAdmin();
    return await payoutOps.countPendingWithdrawals();
  } catch {
    return 0;
  }
}
