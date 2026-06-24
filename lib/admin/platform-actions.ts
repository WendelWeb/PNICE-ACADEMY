'use server';

/**
 * Platform + admin-management actions (Phase C Lot 3). The most sensitive in the
 * system: every one is super-admin-only, audited, and protected by server-side
 * guards (no self-modification; always keep one active super-admin).
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole, isAdminSuspended } from '@/lib/admin/access';
import { isAdminRole, type AdminRole } from '@/lib/admin/roles';
import { recordAudit, type AdminActor } from '@/lib/admin/data';
import { getPlatform, type ProviderKey, PROVIDER_KEYS } from '@/lib/admin/platform/store';

export type PlatformResult = { ok: boolean; message?: string };

async function requireSuperAdmin(): Promise<{ actor: AdminActor; userId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (resolveAdminRole(user) !== 'super-admin') throw new Error('forbidden');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { actor: { id: userId, name }, userId };
}
function fail(e: unknown): PlatformResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

/** Count active (non-suspended) super-admins across the Clerk instance. */
async function activeSuperAdmins(): Promise<{ id: string }[]> {
  const client = await clerkClient();
  const res = await client.users.getUserList({ limit: 100 });
  const list = Array.isArray(res) ? res : res.data;
  return list.filter((u) => u.publicMetadata?.role === 'super-admin' && !isAdminSuspended(u)).map((u) => ({ id: u.id }));
}

/* ---------------------------- admin management ---------------------------- */
export async function inviteAdminAction(email: string, role: string): Promise<PlatformResult> {
  try {
    const { actor } = await requireSuperAdmin();
    if (!isAdminRole(role)) return { ok: false, message: 'invalid_role' };
    if (!email.trim()) return { ok: false, message: 'email_required' };
    const client = await clerkClient();
    // Role is applied via the invitation's publicMetadata only WHEN the user
    // accepts + signs up — never assigned to a non-existent account beforehand.
    await client.invitations.createInvitation({
      emailAddress: email.trim(),
      publicMetadata: { role },
      ignoreExisting: true,
    });
    await recordAudit({ action: 'invite_admin', userId: actor.id, admin: actor, detail: `${email}:${role}` });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changeAdminRoleAction(targetUserId: string, role: string): Promise<PlatformResult> {
  try {
    const { actor } = await requireSuperAdmin();
    if (!isAdminRole(role)) return { ok: false, message: 'invalid_role' };
    if (targetUserId === actor.id) return { ok: false, message: 'cannot_self' };
    const client = await clerkClient();
    const target = await client.users.getUser(targetUserId);
    // Don't demote the last active super-admin.
    if (target.publicMetadata?.role === 'super-admin' && role !== 'super-admin') {
      const supers = await activeSuperAdmins();
      if (supers.length <= 1) return { ok: false, message: 'last_super_admin' };
    }
    await client.users.updateUserMetadata(targetUserId, { publicMetadata: { role } });
    await recordAudit({ action: 'change_admin_role', userId: targetUserId, admin: actor, detail: role });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setAdminSuspendedAction(targetUserId: string, suspended: boolean): Promise<PlatformResult> {
  try {
    const { actor } = await requireSuperAdmin();
    if (targetUserId === actor.id) return { ok: false, message: 'cannot_self' };
    const client = await clerkClient();
    const target = await client.users.getUser(targetUserId);
    if (suspended && target.publicMetadata?.role === 'super-admin') {
      const supers = await activeSuperAdmins();
      if (supers.length <= 1) return { ok: false, message: 'last_super_admin' };
    }
    await client.users.updateUserMetadata(targetUserId, { publicMetadata: { adminSuspended: suspended } });
    await recordAudit({ action: suspended ? 'suspend_admin' : 'reactivate_admin', userId: targetUserId, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------- platform settings --------------------------- */
export async function toggleProviderAction(provider: ProviderKey, enabled: boolean): Promise<PlatformResult> {
  try {
    const { actor } = await requireSuperAdmin();
    const p = getPlatform().providers;
    if (!enabled && PROVIDER_KEYS.filter((k) => p[k]).length <= 1) {
      return { ok: false, message: 'last_provider' };
    }
    p[provider] = enabled;
    await recordAudit({ action: 'toggle_provider', userId: actor.id, admin: actor, detail: `${provider}:${enabled}` });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setSubscriptionPriceAction(usd: number): Promise<PlatformResult> {
  try {
    const { actor } = await requireSuperAdmin();
    if (!Number.isFinite(usd) || usd <= 0) return { ok: false, message: 'invalid' };
    getPlatform().subscriptionUsd = Math.round(usd);
    await recordAudit({ action: 'set_sub_price', userId: actor.id, admin: actor, detail: String(usd) });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMaintenanceAction(enabled: boolean, messageHt: string, messageFr: string): Promise<PlatformResult> {
  try {
    const { actor } = await requireSuperAdmin();
    const m = getPlatform().maintenance;
    m.enabled = enabled;
    m.message_ht = messageHt;
    m.message_fr = messageFr;
    await recordAudit({ action: 'toggle_maintenance', userId: actor.id, admin: actor, detail: enabled ? 'on' : 'off' });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
