'use server';

/**
 * Support & système server actions (Phase D Lot 2). Admin mutations gated on
 * `support.act` (read polls on `support.read`); refunds reuse the Phase A Lot 3
 * `refundPayment` and stay gated on `transactions.refund`. `submitSupportTicket`
 * is for an AUTHENTICATED LEARNER (not an admin) — it just files a ticket.
 * Every admin action writes an audit_log entry inside the data layer.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
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

export async function replyTicketAction(ticketId: string, body: string): Promise<SupResult> {
  try {
    const actor = await requireCap('support.act');
    return await replyTicket({ ticketId, body, actor });
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
