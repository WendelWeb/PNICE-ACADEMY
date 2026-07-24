/**
 * Real (Drizzle) Support & système domain (Task L2e — the LAST admin data
 * domain; after this, realDataSource() covers every AdminDataSource method).
 * The mock (`lib/admin/data/mock/index.ts` — getTickets/getTicketById/
 * getOpenUnassignedCount/createTicket/assignTicket/replyTicket/setTicketStatus/
 * getTemplates/createTemplate/updateTemplate/deleteTemplate/getNotifications/
 * markNotificationRead/markAllNotificationsRead/getWebhookLogs/replayWebhook/
 * getErrorLogs/getSupportSettings/setSupportSettings) is the reference for
 * every method's exact shape and semantics; this file reproduces that
 * behaviour from real rows, same "load + filter in JS" style as
 * ../subscriptions.ts / ../marketing.ts (these tables are admin/support-sized,
 * not transaction-volume-sized).
 *
 * Mutations write through `recordAudit` (../users.ts) — same audit path every
 * other real domain uses. `createTicket` itself is NOT audited (the mock
 * doesn't audit it either — it only raises a notification).
 *
 * SCHEMA-DRIVEN DEGENERACIES (documented once here; each method references the
 * matching note instead of repeating it):
 *
 *  1. `support_tickets.user_id` (db/schema.ts) is a NOT NULL uuid FK to
 *     `users.id`. Both real callers of `createTicket`
 *     (`lib/admin/support-actions.ts` submitSupportTicketAction and
 *     `lib/site-actions-public.ts` registerTeachInterestAction) pass the
 *     Clerk user id (a string like `user_…`), not a `users.id` — the mock's
 *     `SupportTicket.userId` doc even says "…or a real Clerk id for
 *     owner-submitted tickets", matching this. A raw Clerk id can never satisfy
 *     the uuid FK, so `createTicket` resolves it via `resolveOrCreateUserId`:
 *     look up `users.clerkId` first (the normal case — the Clerk webhook,
 *     app/api/webhooks/clerk, already synced this signed-in user), then fall
 *     back to treating the id as an already-resolved `users.id`, and — only if
 *     neither matches (e.g. the webhook hasn't fired yet for a brand-new
 *     signup) — self-heals by inserting a `users` row from the caller-supplied
 *     name/email (the exact same upsert shape the webhook itself performs).
 *     This never crashes and never fabricates data: every field written is
 *     either supplied by the caller or already on Clerk's own account. The
 *     stored (and every returned) `ticket.userId` is therefore always a real
 *     internal `users.id` — which is what makes the admin fiche link
 *     (`/admin/utilisateurs/${ticket.userId}` in
 *     app/[locale]/admin/support/[ticketId]/page.tsx) resolve correctly,
 *     unlike the mock where a Clerk-id ticket deliberately renders
 *     `userExists: false` (see note 3) and never links anywhere.
 *
 *  2. `support_tickets` has no `user_name`/`user_email` columns (unlike the
 *     mock's `SupportTicket`, which stores a name/email snapshot at creation
 *     time). Since note (1) guarantees `userId` is always a resolvable
 *     `users.id`, every read (`getTickets`/`getTicketById`) derives
 *     `userName`/`userEmail` live via a join to `users` instead — arguably
 *     more accurate (reflects the learner's current Clerk profile) than a
 *     stale snapshot, and avoids storing PII twice.
 *
 *  3. `userExists` is mock-only interesting when a ticket's `userId` might not
 *     resolve to a real learner (e.g. a Clerk-id ticket against the mock's
 *     synthetic `usr_…` dataset). Because `support_tickets.user_id` is a real
 *     FK with `onDelete: 'cascade'`, a real ticket can never outlive its user
 *     row — so `userExists` is definitionally `true` for every ticket that
 *     exists at all. Still computed via a live join (not hardcoded `true`) so
 *     behaviour stays correct if that invariant ever changes.
 *
 *  4. `error_logs.stack_truncated`/`route` are nullable (a future
 *     programmatic error-logger might not always have both); mock's
 *     `ErrorLog` fields are non-null strings. Falls back to `''`.
 *
 *  5. `SupportSettings` (dailyDigestEnabled/dailyDigestHour) is NOT a schema
 *     gap: `platform_settings` (db/schema.ts) is a real singleton row with
 *     both columns (defaults true/8, matching the mock's defaults). Read/write
 *     the same way marketing.ts's getReferralCreditCents/setReferralCredit
 *     use that row.
 *
 *  6. `webhook_logs.provider` stores the same raw provider vocabulary as
 *     `payments.provider` (see app/api/webhooks/stripe/route.ts: `provider:
 *     'stripe'`), so it needs the identical stripe→card `methodOf` mapping
 *     used throughout ../users.ts and ../marketing.ts.
 *
 *  7. `replayWebhook` does not actually re-dispatch the stored payload to
 *     `lib/payments/fulfill.ts` — the mock's own comment says the same thing
 *     ("Mock: a replay succeeds. Production: re-dispatch the stored payload
 *     to the handler."); payments wiring is FROZEN per the launch plan except
 *     where a task explicitly extends it, so this mirrors the mock's
 *     mark-as-processed behaviour exactly rather than building real redrive.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import { recordAudit } from './users';
import type {
  AdminActor,
  AdminNotification,
  AdminPayment,
  ErrorLog,
  NotificationFeed,
  PaymentMethod,
  PaymentStatus,
  SupportReply,
  SupportSettings,
  SupportTemplate,
  SupportTicket,
  TicketDetail,
  TicketPage,
  TicketQuery,
  TicketStatus,
  TicketType,
  WebhookLog,
  WebhookQuery,
} from '../types';

const T = schema;
const SUB_CENTS = SUBSCRIPTION_USD * 100;

type DbTicket = typeof T.supportTickets.$inferSelect;
type DbUser = typeof T.users.$inferSelect;
type DbTemplate = typeof T.supportTemplates.$inferSelect;
type DbNotification = typeof T.adminNotifications.$inferSelect;
type DbWebhookLog = typeof T.webhookLogs.$inferSelect;
type DbErrorLog = typeof T.errorLogs.$inferSelect;

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}
const payStatus = (s: string): PaymentStatus => (s === 'completed' ? 'succeeded' : (s as PaymentStatus));
const methodOf = (p: string): PaymentMethod => (p === 'stripe' ? 'card' : (p as PaymentMethod));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** See file-header degeneracy note (1). */
async function resolveOrCreateUserId(externalId: string, name: string, email: string): Promise<string> {
  const [byClerk] = await db.select({ id: T.users.id }).from(T.users).where(eq(T.users.clerkId, externalId)).limit(1);
  if (byClerk) return byClerk.id;
  if (UUID_RE.test(externalId)) {
    const [byId] = await db.select({ id: T.users.id }).from(T.users).where(eq(T.users.id, externalId)).limit(1);
    if (byId) return byId.id;
  }
  // Self-heal: no matching users row yet (e.g. the Clerk webhook hasn't synced
  // this signup). Insert one from the caller-supplied identity — the same
  // upsert shape app/api/webhooks/clerk/route.ts itself performs.
  const [inserted] = await db
    .insert(T.users)
    .values({ clerkId: externalId, email, name, certificateName: name })
    .onConflictDoUpdate({ target: T.users.clerkId, set: { email, name } })
    .returning({ id: T.users.id });
  return inserted.id;
}

/* ================================ tickets ================================= */

function toTicket(t: DbTicket, userById: Map<string, DbUser>): SupportTicket {
  const u = userById.get(t.userId);
  return {
    id: t.id,
    userId: t.userId,
    userName: u?.name ?? u?.email ?? '—',
    userEmail: u?.email ?? '—',
    type: t.type,
    subject: t.subject,
    message: t.message,
    status: t.status,
    assignedAdminId: t.assignedAdminId,
    assignedAdminName: t.assignedAdminName,
    relatedPaymentId: t.relatedPaymentId,
    createdAt: iso(t.createdAt)!,
    updatedAt: iso(t.updatedAt)!,
  };
}

export async function getTickets(query: TicketQuery): Promise<TicketPage> {
  const [ticketRows, users] = await Promise.all([
    db.select().from(T.supportTickets),
    db.select().from(T.users),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  let rows = ticketRows.map((t) => toTicket(t, userById));

  if (query.search) {
    const s = query.search.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.userName.toLowerCase().includes(s) || r.userEmail.toLowerCase().includes(s) || r.subject.toLowerCase().includes(s),
    );
  }
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.type) rows = rows.filter((r) => r.type === query.type);
  if (query.from) rows = rows.filter((r) => r.createdAt >= query.from!);
  if (query.to) rows = rows.filter((r) => r.createdAt <= query.to! + 'T23:59:59.999Z');
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const counts = {
    all: ticketRows.length,
    open: ticketRows.filter((t) => t.status === 'open').length,
    in_progress: ticketRows.filter((t) => t.status === 'in_progress').length,
    resolved: ticketRows.filter((t) => t.status === 'resolved').length,
    unassignedOpen: ticketRows.filter((t) => t.status === 'open' && !t.assignedAdminId).length,
  };
  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? 25;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize, counts };
}

export async function getTicketById(id: string): Promise<TicketDetail | null> {
  const [t] = await db.select().from(T.supportTickets).where(eq(T.supportTickets.id, id)).limit(1);
  if (!t) return null;
  const [user] = await db.select().from(T.users).where(eq(T.users.id, t.userId)).limit(1);
  const userById = new Map<string, DbUser>(user ? [[user.id, user]] : []);
  const ticket = toTicket(t, userById);

  const replyRows = await db.select().from(T.supportReplies).where(eq(T.supportReplies.ticketId, id));
  const replies: SupportReply[] = replyRows
    .map((r) => ({
      id: r.id,
      ticketId: r.ticketId,
      authorType: r.authorType,
      authorId: r.authorId,
      authorName: r.authorName,
      body: r.body,
      createdAt: iso(r.createdAt)!,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let payment: AdminPayment | null = null;
  if (t.relatedPaymentId) {
    const [p] = await db.select().from(T.payments).where(eq(T.payments.id, t.relatedPaymentId)).limit(1);
    if (p) {
      payment = {
        id: p.id,
        userId: p.userId,
        productType: p.productType,
        courseSlug: p.courseSlug,
        method: methodOf(p.provider),
        status: payStatus(p.status),
        amountCents: p.amountCents,
        currency: 'USD',
        createdAt: iso(p.createdAt)!,
        isRefund: p.status === 'refunded' ? true : undefined,
      };
    }
  }
  // See file-header degeneracy note (3).
  return { ticket, replies, payment, userExists: Boolean(user) };
}

export async function getOpenUnassignedCount(): Promise<number> {
  const rows = await db.select().from(T.supportTickets);
  return rows.filter((t) => t.status === 'open' && !t.assignedAdminId).length;
}

/** See file-header degeneracy note (1) for the userId resolution. Not audited
 *  (mirrors the mock — createTicket only raises a notification). */
export async function createTicket(p: {
  userId: string;
  userName: string;
  userEmail: string;
  type: TicketType;
  subject: string;
  message: string;
  relatedPaymentId?: string | null;
}): Promise<{ id: string }> {
  const userId = await resolveOrCreateUserId(p.userId, p.userName, p.userEmail);
  const [row] = await db
    .insert(T.supportTickets)
    .values({
      userId,
      type: p.type,
      subject: p.subject,
      message: p.message,
      relatedPaymentId: p.relatedPaymentId ?? null,
    })
    .returning({ id: T.supportTickets.id });

  // A new ticket raises an admin notification (refund tickets are critical) — mirrors the mock.
  await db.insert(T.adminNotifications).values({
    kind: p.type === 'refund' ? 'refund_request' : 'sale',
    severity: p.type === 'refund' ? 'critical' : 'info',
    userId,
    userName: p.userName,
    amountCents: null,
    detail: `Nouveau ticket: ${p.subject}`,
    read: false,
  });
  return { id: row.id };
}

export async function assignTicket(p: { ticketId: string; adminId: string | null; adminName: string | null; actor: AdminActor }): Promise<void> {
  const [t] = await db.select().from(T.supportTickets).where(eq(T.supportTickets.id, p.ticketId)).limit(1);
  if (t) {
    const patch: Partial<typeof T.supportTickets.$inferInsert> = {
      assignedAdminId: p.adminId,
      assignedAdminName: p.adminName,
      updatedAt: new Date(),
    };
    if (t.status === 'open' && p.adminId) patch.status = 'in_progress';
    await db.update(T.supportTickets).set(patch).where(eq(T.supportTickets.id, p.ticketId));
  }
  await recordAudit({
    action: 'assign_ticket',
    userId: t?.userId ?? '',
    admin: p.actor,
    detail: `${p.ticketId}:${p.adminName ?? 'unassigned'}`,
  });
}

export async function replyTicket(p: { ticketId: string; body: string; actor: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const [t] = await db.select().from(T.supportTickets).where(eq(T.supportTickets.id, p.ticketId)).limit(1);
  if (!t) return { ok: false, message: 'not_found' };
  if (!p.body.trim()) return { ok: false, message: 'empty' };

  await db.insert(T.supportReplies).values({
    ticketId: p.ticketId,
    authorType: 'admin',
    authorId: p.actor.id,
    authorName: p.actor.name,
    body: p.body.trim(),
  });
  await db
    .update(T.supportTickets)
    .set({ updatedAt: new Date(), ...(t.status === 'open' ? { status: 'in_progress' as const } : {}) })
    .where(eq(T.supportTickets.id, p.ticketId));
  // Production: email the reply to the learner via Resend (see mock's identical comment).
  await recordAudit({ action: 'reply_ticket', userId: t.userId, admin: p.actor, detail: p.ticketId });
  return { ok: true };
}

export async function setTicketStatus(p: { ticketId: string; status: TicketStatus; actor: AdminActor }): Promise<void> {
  const [t] = await db.select().from(T.supportTickets).where(eq(T.supportTickets.id, p.ticketId)).limit(1);
  if (t) {
    await db.update(T.supportTickets).set({ status: p.status, updatedAt: new Date() }).where(eq(T.supportTickets.id, p.ticketId));
  }
  await recordAudit({
    action: 'set_ticket_status',
    userId: t?.userId ?? '',
    admin: p.actor,
    detail: `${p.ticketId}:${p.status}`,
  });
}

/* =============================== templates ================================ */

function toTemplate(r: DbTemplate): SupportTemplate {
  return {
    id: r.id,
    category: r.category,
    title_ht: r.titleHt,
    title_fr: r.titleFr,
    body_ht: r.bodyHt,
    body_fr: r.bodyFr,
    createdAt: iso(r.createdAt)!,
  };
}

export async function getTemplates(): Promise<SupportTemplate[]> {
  const rows = await db.select().from(T.supportTemplates);
  return rows.map(toTemplate).sort((a, b) => a.category.localeCompare(b.category) || a.title_fr.localeCompare(b.title_fr));
}

export async function createTemplate(p: { input: Omit<SupportTemplate, 'id' | 'createdAt'>; actor: AdminActor }): Promise<{ id: string }> {
  const [row] = await db
    .insert(T.supportTemplates)
    .values({
      category: p.input.category,
      titleHt: p.input.title_ht,
      titleFr: p.input.title_fr,
      bodyHt: p.input.body_ht,
      bodyFr: p.input.body_fr,
    })
    .returning({ id: T.supportTemplates.id });
  await recordAudit({ action: 'create_template', userId: p.actor.id, admin: p.actor, detail: p.input.title_fr });
  return { id: row.id };
}

export async function updateTemplate(p: { id: string; patch: Partial<Omit<SupportTemplate, 'id' | 'createdAt'>>; actor: AdminActor }): Promise<void> {
  const set: Partial<typeof T.supportTemplates.$inferInsert> = {};
  if (p.patch.category !== undefined) set.category = p.patch.category;
  if (p.patch.title_ht !== undefined) set.titleHt = p.patch.title_ht;
  if (p.patch.title_fr !== undefined) set.titleFr = p.patch.title_fr;
  if (p.patch.body_ht !== undefined) set.bodyHt = p.patch.body_ht;
  if (p.patch.body_fr !== undefined) set.bodyFr = p.patch.body_fr;
  if (Object.keys(set).length > 0) {
    await db.update(T.supportTemplates).set(set).where(eq(T.supportTemplates.id, p.id));
  }
  await recordAudit({ action: 'update_template', userId: p.actor.id, admin: p.actor, detail: p.id });
}

export async function deleteTemplate(p: { id: string; actor: AdminActor }): Promise<void> {
  await db.delete(T.supportTemplates).where(eq(T.supportTemplates.id, p.id));
  await recordAudit({ action: 'delete_template', userId: p.actor.id, admin: p.actor, detail: p.id });
}

/* ============================= notifications =============================== */

function toNotification(r: DbNotification): AdminNotification {
  return {
    id: r.id,
    kind: r.kind,
    severity: r.severity,
    userId: r.userId,
    userName: r.userName,
    amountCents: r.amountCents,
    detail: r.detail,
    createdAt: iso(r.createdAt)!,
    read: r.read,
  };
}

export async function getNotifications(p?: { limit?: number }): Promise<NotificationFeed> {
  const rows = await db.select().from(T.adminNotifications);
  const sorted = rows.map(toNotification).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = p?.limit ?? 30;
  return {
    items: sorted.slice(0, limit),
    unread: rows.filter((r) => !r.read).length,
    criticalUnread: rows.filter((r) => !r.read && r.severity === 'critical').length,
  };
}

export async function markNotificationRead(p: { id: string }): Promise<void> {
  await db.update(T.adminNotifications).set({ read: true }).where(eq(T.adminNotifications.id, p.id));
}

export async function markAllNotificationsRead(): Promise<void> {
  await db.update(T.adminNotifications).set({ read: true }).where(eq(T.adminNotifications.read, false));
}

/* ============================== webhook logs =============================== */

/** See file-header degeneracy note (6). */
function toWebhookLog(r: DbWebhookLog): WebhookLog {
  return {
    id: r.id,
    provider: methodOf(r.provider),
    eventType: r.eventType,
    status: r.status,
    errorMessage: r.errorMessage,
    receivedAt: iso(r.receivedAt)!,
    processedAt: iso(r.processedAt),
    retryCount: r.retryCount,
    ref: r.providerRef,
  };
}

export async function getWebhookLogs(query: WebhookQuery): Promise<WebhookLog[]> {
  const rows = await db.select().from(T.webhookLogs);
  let out = rows.map(toWebhookLog);
  if (query.provider) out = out.filter((r) => r.provider === query.provider);
  if (query.status) out = out.filter((r) => r.status === query.status);
  if (query.from) out = out.filter((r) => r.receivedAt >= query.from!);
  if (query.to) out = out.filter((r) => r.receivedAt <= query.to! + 'T23:59:59.999Z');
  return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** See file-header degeneracy note (7). */
export async function replayWebhook(p: { id: string; actor: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const [w] = await db.select().from(T.webhookLogs).where(eq(T.webhookLogs.id, p.id)).limit(1);
  if (!w) return { ok: false, message: 'not_found' };
  if (w.status !== 'failed') return { ok: false, message: 'not_failed' };

  await db
    .update(T.webhookLogs)
    .set({ status: 'processed', processedAt: new Date(), retryCount: w.retryCount + 1, errorMessage: null })
    .where(eq(T.webhookLogs.id, p.id));
  // Clear the matching critical notification, if any.
  await db
    .update(T.adminNotifications)
    .set({ read: true })
    .where(and(eq(T.adminNotifications.kind, 'webhook_error'), eq(T.adminNotifications.read, false)));
  await recordAudit({ action: 'replay_webhook', userId: p.actor.id, admin: p.actor, detail: `${w.provider}:${w.eventType}` });
  return { ok: true };
}

/* =============================== error logs ================================ */

/** See file-header degeneracy note (4). */
function toErrorLog(r: DbErrorLog): ErrorLog {
  return {
    id: r.id,
    message: r.message,
    stackTruncated: r.stackTruncated ?? '',
    route: r.route ?? '',
    firstAt: iso(r.firstAt)!,
    lastAt: iso(r.lastAt)!,
    count: r.count,
  };
}

export async function getErrorLogs(): Promise<ErrorLog[]> {
  const rows = await db.select().from(T.errorLogs);
  return rows.map(toErrorLog).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/* ============================= support settings ============================= */

/** See file-header degeneracy note (5) — real singleton row, no schema gap. */
export async function getSupportSettings(): Promise<SupportSettings> {
  const [row] = await db.select().from(T.platformSettings).where(eq(T.platformSettings.id, 'singleton')).limit(1);
  return {
    dailyDigestEnabled: row?.dailyDigestEnabled ?? true,
    dailyDigestHour: row?.dailyDigestHour ?? 8,
  };
}

export async function setSupportSettings(p: { enabled: boolean; hour: number; actor: AdminActor }): Promise<void> {
  const hour = Math.min(23, Math.max(0, Math.round(p.hour)));
  await db
    .insert(T.platformSettings)
    .values({ id: 'singleton', subscriptionUsdCents: SUB_CENTS, dailyDigestEnabled: p.enabled, dailyDigestHour: hour })
    .onConflictDoUpdate({
      target: T.platformSettings.id,
      set: { dailyDigestEnabled: p.enabled, dailyDigestHour: hour, updatedAt: new Date() },
    });
  await recordAudit({ action: 'set_digest', userId: p.actor.id, admin: p.actor, detail: `${p.enabled ? 'on' : 'off'}@${p.hour}h` });
}
