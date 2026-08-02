'use server';

/**
 * Admin "lancer la répartition" server action (Task: pro-rata split of
 * PNICE all-access revenue, /admin/repartition). Thin auth+wiring layer over
 * lib/teacher/platform-pass-payout.ts — mirrors the established
 * lib/teacher/payout-actions.ts → lib/teacher/payouts.ts division of labour
 * exactly: `requireAdmin` here (Clerk role + `payouts.process` capability
 * check, the SAME capability /admin/retraits gates on — this is a teacher-
 * money page too), the real Drizzle write + `recordAudit` there.
 *
 * Wrapped in try/catch (`fail(e)`): an unauthenticated/unauthorized caller,
 * or a DB error surfaced as `{ ok:false, message:'db_required' }` by
 * lib/teacher/platform-pass-payout.ts, both resolve to a plain result —
 * never a thrown/crashed server action.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { runPlatformPassSplitForPeriod } from './platform-pass-payout';
import type { AdminActor } from '@/lib/admin/data/types';

export type PlatformPassActionResult = { ok: boolean; message?: string };

async function requireAdmin(): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'payouts.process')) throw new Error('forbidden');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { id: userId, name };
}

function fail(e: unknown): PlatformPassActionResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

export async function runPlatformPassSplitAction(period: string): Promise<PlatformPassActionResult> {
  try {
    const admin = await requireAdmin();
    const result = await runPlatformPassSplitForPeriod(period, admin);
    return { ok: result.ok, message: result.message };
  } catch (e) {
    return fail(e);
  }
}
