'use server';

/**
 * Support & système server actions (Phase D Lot 2). Admin mutations gated on
 * `support.act` (read polls on `support.read`); refunds reuse the Phase A Lot 3
 * `refundPayment` and stay gated on `transactions.refund`. `submitSupportTicket`
 * is for an AUTHENTICATED LEARNER (not an admin) — it just files a ticket.
 * Every admin action writes an audit_log entry inside the data layer.
 */
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can, type Capability } from '@/lib/admin/permissions';
import {
  assignTicket,
  replyTicket,
  setTicketStatus,
  refundPayment,
  getTicketById,
  createTicket,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getOpenUnassignedCount,
  replayWebhook,
  setSupportSettings,
  type AdminActor,
  type TicketStatus,
  type TicketType,
  type SupportTemplate,
  type NotificationFeed,
} from '@/lib/admin/data';
import { checkBunnyStream, type BunnyStatus } from '@/lib/admin/health/bunny';
import { sendEmail, emailLive, DEFAULT_FROM } from '@/lib/email/resend';
import { buildTestEmailHtml, buildSupportReplyHtml } from '@/lib/email/templates';

export type SupResult = { ok: boolean; message?: string; id?: string };

async function requireCap(cap: Capability): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, cap)) throw new Error('forbidden');
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { id: userId, name };
}
function fail(e: unknown): SupResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

/* -------------------------------- tickets -------------------------------- */
export async function assignTicketAction(ticketId: string, adminId: string | null, adminName: string | null): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    await assignTicket({ ticketId, adminId, adminName, actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * `locale` drives only the email's CHROME (greeting, headings, footer) — the
 * reply body itself is whatever the admin typed. We use the admin console's
 * current locale rather than the learner's because we don't store a learner
 * language preference, and the admin wrote the reply while looking at that
 * locale, so its chrome is the one that matches the body. Defaults to 'ht'
 * (the platform default) so any caller that omits it still compiles.
 */
export async function replyTicketAction(ticketId: string, body: string, locale: 'fr' | 'ht' = 'ht'): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    const r = await replyTicket({ ticketId, body, actor });
    if (r.ok) {
      // Notify the learner by email (real send when RESEND_API_KEY is set; a safe
      // no-op otherwise). Failure to email never fails the reply itself.
      const detail = await getTicketById(ticketId);
      if (detail?.ticket.userEmail && detail.ticket.userEmail !== '—') {
        const { subject, html, text } = buildSupportReplyHtml({
          locale,
          name: detail.ticket.userName || null,
          ticketSubject: detail.ticket.subject,
          body,
          ref: detail.ticket.id,
        });
        await sendEmail({ to: detail.ticket.userEmail, subject, html, text });
      }
    }
    return r;
  } catch (e) {
    return fail(e);
  }
}

export async function setTicketStatusAction(ticketId: string, status: TicketStatus): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    await setTicketStatus({ ticketId, status, actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Task 3: process a refund FROM a refund ticket — reuses the existing refund. */
export async function refundFromTicketAction(ticketId: string): Promise<SupResult> {
  try {
    const actor = await requireCap('transactions.refund');
    const detail = await getTicketById(ticketId);
    if (!detail) return { ok: false, message: 'not_found' };
    const { ticket, payment } = detail;
    if (ticket.type !== 'refund' || !payment) return { ok: false, message: 'no_payment' };
    if (payment.status !== 'succeeded') return { ok: false, message: 'not_refundable' };
    await refundPayment({ userId: payment.userId, paymentId: payment.id, admin: actor });
    await setTicketStatus({ ticketId, status: 'resolved', actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- templates ------------------------------- */
export async function createTemplateAction(input: Omit<SupportTemplate, 'id' | 'createdAt'>): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    if (!input.title_fr.trim() || !input.body_fr.trim()) return { ok: false, message: 'fields_required' };
    const r = await createTemplate({ input, actor });
    return { ok: true, id: r.id };
  } catch (e) {
    return fail(e);
  }
}
export async function updateTemplateAction(id: string, patch: Partial<Omit<SupportTemplate, 'id' | 'createdAt'>>): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    await updateTemplate({ id, patch, actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
export async function deleteTemplateAction(id: string): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    await deleteTemplate({ id, actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------------- notifications ----------------------------- */
/** Polled by the header bell (every 30s). */
export async function getNotificationsAction(): Promise<NotificationFeed | null> {
  try {
    await requireCap('support.read');
    return await getNotifications({ limit: 30 });
  } catch {
    return null;
  }
}
export async function markNotificationReadAction(id: string): Promise<SupResult> {
  try {
    await requireCap('support.read');
    await markNotificationRead({ id });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
export async function markAllNotificationsReadAction(): Promise<SupResult> {
  try {
    await requireCap('support.read');
    await markAllNotificationsRead();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
/** Polled by the sidebar support badge (every 60s). */
export async function getSupportBadgeAction(): Promise<number> {
  try {
    await requireCap('support.read');
    return await getOpenUnassignedCount();
  } catch {
    return 0;
  }
}

/* ------------------------------ santé système ---------------------------- */
export async function replayWebhookAction(id: string): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    return await replayWebhook({ id, actor });
  } catch (e) {
    return fail(e);
  }
}
export async function recheckBunnyAction(): Promise<BunnyStatus | null> {
  try {
    await requireCap('support.read');
    return await checkBunnyStream();
  } catch {
    return null;
  }
}
/** Rich diagnostic result for the admin health "send test email" button —
 *  richer than `SupResult` on purpose: the owner needs to see WHY a send was
 *  skipped (no key vs. not live vs. no resolvable email) and the exact
 *  `from`/`to` used, since a misconfigured `RESEND_FROM` (unverified sender
 *  domain) fails at Resend, not locally. */
export type TestEmailResult = {
  ok: boolean;
  sent: boolean;
  skipped: boolean;
  reason?: 'no_key' | 'not_live' | 'unauthorized' | 'no_email';
  to?: string;
  from?: string;
  id?: string;
  error?: string;
};

/**
 * Sends a small bilingual test email to confirm the Resend wiring actually
 * works end to end (key valid + `from` domain verified). The recipient is
 * ALWAYS the acting admin's own Clerk email — never client-supplied — so this
 * can never be used to spam an arbitrary address.
 */
export async function sendTestEmailAction(locale: 'fr' | 'ht'): Promise<TestEmailResult> {
  const from = process.env.RESEND_FROM ?? DEFAULT_FROM;
  try {
    await requireCap('support.read');
  } catch {
    return { ok: false, sent: false, skipped: true, reason: 'unauthorized', from };
  }

  if (!process.env.RESEND_API_KEY) {
    return { ok: false, sent: false, skipped: true, reason: 'no_key', from };
  }
  if (!emailLive()) {
    return { ok: false, sent: false, skipped: true, reason: 'not_live', from };
  }

  const cu = await currentUser();
  const to = cu
    ? cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ?? cu.emailAddresses[0]?.emailAddress
    : undefined;
  if (!to) {
    return { ok: false, sent: false, skipped: true, reason: 'no_email', from };
  }

  try {
    const { subject, html, text } = buildTestEmailHtml({
      locale,
      adminName: cu?.firstName ?? null,
      from,
      dateIso: new Date().toISOString(),
    });
    const r = await sendEmail({ to, subject, html, text, from });
    if (!r.sent) return { ok: false, sent: false, skipped: r.skipped, to, from, error: r.error };
    return { ok: true, sent: true, skipped: false, to, from, id: r.id };
  } catch (e) {
    return { ok: false, sent: false, skipped: false, to, from, error: e instanceof Error ? e.message : 'error' };
  }
}

export async function setDigestAction(enabled: boolean, hour: number): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    await setSupportSettings({ enabled, hour, actor });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------- learner-facing ticket form ---------------------- */
/** Authenticated LEARNER files a support ticket from /kont (not an admin gate). */
export async function submitSupportTicketAction(input: {
  type: TicketType;
  subject: string;
  message: string;
}): Promise<SupResult> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, message: 'unauthorized' };
    if (!input.subject.trim() || !input.message.trim()) return { ok: false, message: 'fields_required' };
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Utilisateur';
    const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
      ?? user.emailAddresses[0]?.emailAddress ?? '—';
    const r = await createTicket({
      userId,
      userName: name,
      userEmail: email,
      type: input.type,
      subject: input.subject.trim(),
      message: input.message.trim(),
    });
    return { ok: true, id: r.id };
  } catch (e) {
    return fail(e);
  }
}
