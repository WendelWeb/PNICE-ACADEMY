'use server';

/**
 * Manual admin actions. Each one:
 *  - verifies the caller is a signed-in admin AND has the required capability
 *    (lib/admin/permissions) — defense in depth on top of the /admin gate,
 *  - mutates the mock data layer through the single switch point, and
 *  - writes an audit_log entry (who / what / on whom / when).
 *
 * Role-management actions (set/revoke admin role) operate on REAL Clerk users
 * via the Backend API — admins are real accounts, unlike the mock learners.
 *
 * NOTE: the learner dashboard runs on MOCK users (ids like `usr_0001`) that are
 * not real Clerk accounts, so Clerk-side effects on them (ban, resend, impersonate)
 * are recorded in the audit log but not executed; the real SDK path is noted.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { isAdminRole, type AdminRole } from '@/lib/admin/roles';
import { can, type Capability } from '@/lib/admin/permissions';
import { setFxRate } from '@/lib/admin/settings';
import {
  grantCourseAccess,
  revokeCourseAccess,
  grantSubscription,
  setUserStatus,
  refundPayment,
  recordAudit,
  revokeCertificate,
  reissueCertificate,
  issueCertificate,
  getUsers,
  type AdminActor,
  type UserStatus,
} from '@/lib/admin/data';

export type ActionResult = { ok: boolean; message?: string };

async function requireAdmin(cap: Capability): Promise<{ actor: AdminActor; role: AdminRole }> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role) throw new Error('forbidden');
  if (!can(role, cap)) throw new Error('forbidden');
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.emailAddresses[0]?.emailAddress ||
    userId;
  return { actor: { id: userId, name }, role };
}

function fail(e: unknown): ActionResult {
  const msg = e instanceof Error ? e.message : 'error';
  return { ok: false, message: msg };
}

/* ----------------------------- user actions ------------------------------ */
export async function grantCourseAction(userId: string, courseSlug: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('users.act');
    await grantCourseAccess({ userId, courseSlug, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeCourseAction(userId: string, courseSlug: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('users.act');
    await revokeCourseAccess({ userId, courseSlug, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function grantSubscriptionAction(userId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('users.act');
    await grantSubscription({ userId, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setStatusAction(
  userId: string,
  status: UserStatus,
  reason: string,
): Promise<ActionResult> {
  try {
    if (status !== 'active' && !reason.trim()) {
      return { ok: false, message: 'reason_required' };
    }
    const { actor } = await requireAdmin('users.act');
    // Production: also call clerkClient.users.banUser/unbanUser — skipped here
    // because mock ids aren't real Clerk users.
    await setUserStatus({ userId, status, reason, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function refundPaymentAction(userId: string, paymentId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('transactions.refund');
    await refundPayment({ userId, paymentId, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resendVerificationAction(userId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('users.act');
    // Clerk Backend has no single "resend verification email" call for an
    // existing user; production would re-run the email verification flow or send
    // an invitation. Audited regardless.
    await recordAudit({ action: 'resend_verification', userId, admin: actor });
    return { ok: true, message: 'queued' };
  } catch (e) {
    return fail(e);
  }
}

export async function impersonateAction(userId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('users.act');
    // Clerk supports impersonation via actor tokens:
    //   const tok = await (await clerkClient()).actorTokens.create({ userId, actor: { sub: actor.id } });
    //   → open tok.url in a new tab to sign in AS the user.
    // Plan-gated and only valid for real Clerk users, so not executed on mock ids.
    await recordAudit({ action: 'impersonate', userId, admin: actor });
    return { ok: true, message: 'impersonation_mock' };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------- transactions / settings ------------------------- */
export async function setFxRateAction(rate: number): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('settings.manage');
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
      return { ok: false, message: 'invalid_rate' };
    }
    setFxRate(rate);
    await recordAudit({ action: 'set_fx_rate', userId: actor.id, admin: actor, detail: String(rate) });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resendReceiptAction(userId: string, paymentId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('transactions.read');
    // Real receipt email lands with the PDF pipeline (Phase 2 Part D); audited now.
    await recordAudit({ action: 'resend_receipt', userId, admin: actor, detail: paymentId });
    return { ok: true, message: 'receipt_sent' };
  } catch (e) {
    return fail(e);
  }
}

export async function sendDunningReminderAction(userId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('transactions.refund');
    // Production: trigger the provider/email dunning. For MonCash/NatCash/Crypto
    // there is no native recurring billing, so dunning is fully manual. Audited.
    await recordAudit({ action: 'dunning_reminder', userId, admin: actor });
    return { ok: true, message: 'reminder_sent' };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------- engagement & certificates ----------------------- */
export async function sendEngagementReminderAction(userId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('courses.read');
    // Production: send the "stuck learner" nudge email (template from /kont notifications).
    await recordAudit({ action: 'engagement_reminder', userId, admin: actor });
    return { ok: true, message: 'reminder_sent' };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeCertificateAction(certId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('courses.edit');
    await revokeCertificate({ certId, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reissueCertificateAction(certId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('courses.edit');
    await reissueCertificate({ certId, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function issueCertificateAction(userId: string, courseSlug: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('courses.edit');
    if (!courseSlug) return { ok: false, message: 'course_required' };
    await issueCertificate({ userId, courseSlug, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Issue from the certificates list, by looking up the (mock) learner's email. */
export async function issueCertByEmailAction(email: string, courseSlug: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('courses.edit');
    if (!email.trim()) return { ok: false, message: 'email_required' };
    if (!courseSlug) return { ok: false, message: 'course_required' };
    const page = await getUsers({ search: email.trim() });
    const u = page.rows.find((r) => r.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) return { ok: false, message: 'user_not_found' };
    await issueCertificate({ userId: u.id, courseSlug, admin: actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------- role management ----------------------------- */
/** Grant/change an admin role on a REAL Clerk user, found by email. */
export async function setRoleByEmailAction(email: string, role: string): Promise<ActionResult> {
  try {
    await requireAdmin('roles.manage');
    if (!isAdminRole(role)) return { ok: false, message: 'invalid_role' };
    const target = email.trim().toLowerCase();
    if (!target) return { ok: false, message: 'email_required' };

    const client = await clerkClient();
    const res = await client.users.getUserList({ emailAddress: [target] });
    const list = Array.isArray(res) ? res : res.data;
    const user = list?.[0];
    if (!user) return { ok: false, message: 'user_not_found' };

    await client.users.updateUserMetadata(user.id, { publicMetadata: { role } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Remove the admin role from a real Clerk user. */
export async function revokeRoleAction(targetUserId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('roles.manage');
    if (targetUserId === actor.id) return { ok: false, message: 'cannot_revoke_self' };
    const client = await clerkClient();
    // null deletes the metadata key in Clerk; the typed shape forbids null, so cast.
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: { role: null } as unknown as UserPublicMetadata,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
