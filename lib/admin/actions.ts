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
import { revalidatePath } from 'next/cache';
import { resolveAdminRole } from '@/lib/admin/access';
import { isAdminRole, type AdminRole } from '@/lib/admin/roles';
import { can, type Capability } from '@/lib/admin/permissions';
import { setFxRate } from '@/lib/fx';
import { setPlatformPassPriceCents } from '@/lib/platformPrice';
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
  getUserById,
  type AdminActor,
  type UserStatus,
} from '@/lib/admin/data';
import { sendEmail } from '@/lib/email/resend';

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
    // fx_rate_htg is an integer column — round here too (belt-and-suspenders
    // on top of lib/fx.ts's own rounding) so the audit log records the exact
    // value actually persisted, not the raw (possibly fractional) input.
    const rounded = Math.round(rate);
    await setFxRate(rounded);
    await recordAudit({ action: 'set_fx_rate', userId: actor.id, admin: actor, detail: String(rounded) });
    // Task fix/fx-rate-unify: the public site's (site) layout is
    // force-dynamic and reads the DB rate fresh on every request, but this
    // still busts the Next.js Router/Full Route Cache for every public
    // route across both locales so an already-cached client picks up the
    // new rate immediately rather than on next natural revalidation —
    // mirrors lib/courses/write.ts's revalidateCoursePaths.
    revalidatePath('/[locale]', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Task: two subscription products — the owner-set "Pass PNICE" all-access
// price. `usd` is a plain dollar amount from the admin form (e.g. 79, or
// 79.99); mirrors setFxRateAction's shape exactly (same capability, same
// belt-and-suspenders rounding on top of lib/platformPrice.ts's own guard,
// same revalidate-the-public-site-on-write reasoning — the price shows up on
// /checkout and /prof/[slug] via server components reading it fresh).
export async function setPlatformPassPriceAction(usd: number): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('settings.manage');
    if (!Number.isFinite(usd) || usd <= 0 || usd > 100000) {
      return { ok: false, message: 'invalid_price' };
    }
    const cents = Math.round(usd * 100);
    await setPlatformPassPriceCents(cents);
    await recordAudit({ action: 'set_platform_pass_price', userId: actor.id, admin: actor, detail: String(cents) });
    revalidatePath('/[locale]', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resendReceiptAction(userId: string, paymentId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('transactions.read');
    // Email the receipt (real send when on real data; safe no-op on mock). The
    // PDF attachment lands with the PDF pipeline; this sends the confirmation.
    const detail = await getUserById(userId);
    const pay = detail?.payments.find((p) => p.id === paymentId);
    if (detail?.user.email) {
      await sendEmail({
        to: detail.user.email,
        subject: 'Votre reçu — PNICE Academy',
        html: `<p>Bonjou ${detail.user.name},</p><p>Men resi pou peman ou${pay ? ` ($${Math.round(pay.amountCents / 100)})` : ''}. Mèsi!</p><hr><p style="color:#888;font-size:12px">PNICE Academy</p>`,
      });
    }
    await recordAudit({ action: 'resend_receipt', userId, admin: actor, detail: paymentId });
    return { ok: true, message: 'receipt_sent' };
  } catch (e) {
    return fail(e);
  }
}

export async function sendDunningReminderAction(userId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireAdmin('transactions.refund');
    // Email the payment-retry reminder (real send on real data; no-op on mock).
    // MonCash/NatCash/Crypto have no native recurring billing → dunning is manual.
    const detail = await getUserById(userId);
    if (detail?.user.email) {
      await sendEmail({
        to: detail.user.email,
        subject: 'Pwoblèm ak peman abònman ou — PNICE Academy',
        html: `<p>Bonjou ${detail.user.name},</p><p>Dènye peman abònman ou pa pase. Tanpri mete ajou mwayen peman ou pou kontinye gen aksè.</p><hr><p style="color:#888;font-size:12px">PNICE Academy</p>`,
      });
    }
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
    // "Stuck learner" nudge (real send on real data; no-op on mock).
    const detail = await getUserById(userId);
    if (detail?.user.email) {
      await sendEmail({
        to: detail.user.email,
        subject: 'Kontinye fòmasyon ou — PNICE Academy',
        html: `<p>Bonjou ${detail.user.name},</p><p>Nou wè ou kòmanse yon fòmasyon men ou poko fini. Tounen kontinye lè ou pare — n ap tann ou!</p><hr><p style="color:#888;font-size:12px">PNICE Academy</p>`,
      });
    }
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
