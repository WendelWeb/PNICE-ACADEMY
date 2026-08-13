/**
 * Learner-scoped account reads for /kont (Stage: learner account) — the tab
 * panel stops being a 'Byento disponib' stub and shows the learner's REAL
 * subscriptions, purchases, certificates and support threads.
 *
 * Same contract as lib/learner/access.ts (the module this one mirrors):
 * every export is GATED + NEVER-THROW — no DATABASE_URL, Clerk disabled,
 * signed out, no users row, or any query failure degrades to an empty
 * result, never a crash. Everything returned is plain serializable data
 * (ISO strings, cents) so the server page can pass it straight into client
 * tab components.
 *
 * OWNER-ONLY by construction: every query starts from the SIGNED-IN
 * learner's own users.id (resolved from their Clerk id server-side) — ticket
 * ids or payment ids coming from the client are only ever used to pick
 * within that already-scoped set (see `getMyTicketThread`'s explicit
 * ownership check, unit-tested in account.test.ts).
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema, isMissingColumnError } from '@/db';
import { paymentsSelectSafe, PAYMENTS_COLUMNS_PRE_0019 } from '@/db/payments-compat';
import { clerkEnabled } from '@/lib/clerk';
import { getAllCourses } from '@/lib/courses/source';
import { getPlatformPassPriceCents } from '@/lib/platformPrice';
import { resolveUserId } from './access';

const T = schema;

function dbReady(): boolean {
  return Boolean(process.env.DATABASE_URL) && clerkEnabled;
}

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

/* ------------------------------ subscriptions ----------------------------- */

export type MySubscription = {
  id: string;
  kind: 'teacher' | 'platform';
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  provider: 'stripe' | 'paypal' | 'crypto';
  /** Teacher display name for a 'teacher'-kind pass; null for Pass PNICE. */
  teacherName: string | null;
  /** Monthly price actually paid (latest charge), else the plan/platform price. */
  priceCents: number | null;
  startedAt: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Whether a Stripe billing portal can manage this (stripe + provider ref). */
  portalEligible: boolean;
};

type RawSubRow = {
  id: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  provider: 'stripe' | 'paypal' | 'crypto';
  providerRef: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  teacherPlanId: string | null;
  kind: 'teacher' | 'platform';
  createdAt: Date;
};

/** Same two-step migration-lag fallback as lib/learner/access.ts's
 *  `getActiveSubscriptions` — a paying subscriber must see their pass even
 *  while a live DB still lags the `kind`/`teacher_plan_id` migrations. */
async function selectMySubscriptionRows(userId: string): Promise<RawSubRow[]> {
  const base = {
    id: T.subscriptions.id,
    status: T.subscriptions.status,
    provider: T.subscriptions.provider,
    providerRef: T.subscriptions.providerRef,
    currentPeriodEnd: T.subscriptions.currentPeriodEnd,
    cancelAtPeriodEnd: T.subscriptions.cancelAtPeriodEnd,
    createdAt: T.subscriptions.createdAt,
  };
  const where = eq(T.subscriptions.userId, userId);
  try {
    return await db
      .select({ ...base, teacherPlanId: T.subscriptions.teacherPlanId, kind: T.subscriptions.kind })
      .from(T.subscriptions)
      .where(where);
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
  }
  try {
    const rows = await db
      .select({ ...base, teacherPlanId: T.subscriptions.teacherPlanId })
      .from(T.subscriptions)
      .where(where);
    return rows.map((r) => ({ ...r, kind: 'platform' as const }));
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
  }
  const rows = await db.select(base).from(T.subscriptions).where(where);
  return rows.map((r) => ({ ...r, teacherPlanId: null, kind: 'platform' as const }));
}

async function buildMySubscriptions(userId: string): Promise<MySubscription[]> {
  const rows = await selectMySubscriptionRows(userId);
  if (rows.length === 0) return [];

  // Resolve teacher plans (price + owner) and owner display names, only for
  // the plans actually referenced.
  const planIds = [...new Set(rows.map((r) => r.teacherPlanId).filter((x): x is string => Boolean(x)))];
  const plans = planIds.length
    ? await db
        .select({
          id: T.teacherPlans.id,
          ownerUserId: T.teacherPlans.ownerUserId,
          priceCentsMonthly: T.teacherPlans.priceCentsMonthly,
        })
        .from(T.teacherPlans)
        .where(inArray(T.teacherPlans.id, planIds))
    : [];
  const planById = new Map(plans.map((p) => [p.id, p]));
  const ownerIds = [...new Set(plans.map((p) => p.ownerUserId).filter((x): x is string => Boolean(x)))];
  const profiles = ownerIds.length
    ? await db
        .select({ userId: T.teacherProfiles.userId, displayName: T.teacherProfiles.displayName })
        .from(T.teacherProfiles)
        .where(inArray(T.teacherProfiles.userId, ownerIds))
    : [];
  const nameByOwner = new Map(profiles.map((p) => [p.userId, p.displayName?.trim() || null]));

  // Latest completed charge per subscription — the truthful "what you pay".
  const subIds = rows.map((r) => r.id);
  const paymentRows = await db
    .select({
      relatedSubscriptionId: T.payments.relatedSubscriptionId,
      amountCents: T.payments.amountCents,
      createdAt: T.payments.createdAt,
      status: T.payments.status,
    })
    .from(T.payments)
    .where(and(eq(T.payments.userId, userId), eq(T.payments.productType, 'subscription')));
  const latestChargeBySub = new Map<string, { amountCents: number; at: number }>();
  for (const p of paymentRows) {
    if (p.status !== 'completed' || !p.relatedSubscriptionId) continue;
    if (!subIds.includes(p.relatedSubscriptionId)) continue;
    const at = p.createdAt.getTime();
    const prev = latestChargeBySub.get(p.relatedSubscriptionId);
    if (!prev || at > prev.at) {
      latestChargeBySub.set(p.relatedSubscriptionId, { amountCents: p.amountCents, at });
    }
  }

  const platformPriceCents = rows.some((r) => r.kind === 'platform')
    ? await getPlatformPassPriceCents()
    : null;

  return rows
    .map((r): MySubscription => {
      const plan = r.teacherPlanId ? planById.get(r.teacherPlanId) : undefined;
      const teacherName =
        r.kind === 'teacher'
          ? (plan?.ownerUserId ? nameByOwner.get(plan.ownerUserId) ?? null : null) ?? 'Anseyan'
          : null;
      const charged = latestChargeBySub.get(r.id)?.amountCents ?? null;
      const priceCents =
        charged ??
        (r.kind === 'teacher' ? plan?.priceCentsMonthly ?? null : platformPriceCents);
      return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        provider: r.provider,
        teacherName,
        priceCents,
        startedAt: iso(r.createdAt)!,
        currentPeriodEnd: iso(r.currentPeriodEnd),
        cancelAtPeriodEnd: r.cancelAtPeriodEnd,
        portalEligible: r.provider === 'stripe' && Boolean(r.providerRef),
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/* ------------------------------- purchases -------------------------------- */

export type MyPurchase = {
  id: string;
  dateIso: string;
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  /** Resolved course titles (null for a subscription/pass purchase). */
  titleHt: string | null;
  titleFr: string | null;
  amountCents: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  reference: string | null;
  /** True when the receipt PDF route can serve this row (completed charge). */
  receiptAvailable: boolean;
};

/* ------------------------------ certificates ------------------------------ */

export type MyCertificate = {
  courseSlug: string;
  titleHt: string;
  titleFr: string;
  code: string;
  issuedAt: string;
  revoked: boolean;
};

/* --------------------------------- tickets -------------------------------- */

export type MyTicketReply = {
  id: string;
  authorType: 'user' | 'admin';
  authorName: string;
  body: string;
  createdAt: string;
};

export type MyTicket = {
  id: string;
  type: 'question' | 'bug' | 'refund' | 'other';
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
  updatedAt: string;
  replies: MyTicketReply[];
};

/* ------------------------------- activity --------------------------------- */

export type AccountEvent = {
  kind:
    | 'purchase'
    | 'refund'
    | 'certificate'
    | 'subscription_started'
    | 'subscription_canceled'
    | 'subscription_past_due';
  at: string;
  /** Course titles when the event concerns a course; null otherwise. */
  titleHt: string | null;
  titleFr: string | null;
  amountCents: number | null;
  /** Certificate verification code for 'certificate' events. */
  code: string | null;
};

/**
 * Pure: the honest minimal notifications feed — ONLY events derivable from
 * data we really store (purchases, certificates, subscription changes).
 * Exported for unit testing without a DB.
 */
export function deriveAccountEvents(input: {
  purchases: MyPurchase[];
  certificates: MyCertificate[];
  subscriptions: MySubscription[];
}): AccountEvent[] {
  const events: AccountEvent[] = [];
  for (const p of input.purchases) {
    if (p.status === 'completed') {
      events.push({ kind: 'purchase', at: p.dateIso, titleHt: p.titleHt, titleFr: p.titleFr, amountCents: p.amountCents, code: null });
    } else if (p.status === 'refunded') {
      events.push({ kind: 'refund', at: p.dateIso, titleHt: p.titleHt, titleFr: p.titleFr, amountCents: p.amountCents, code: null });
    }
  }
  for (const c of input.certificates) {
    events.push({ kind: 'certificate', at: c.issuedAt, titleHt: c.titleHt, titleFr: c.titleFr, amountCents: null, code: c.code });
  }
  for (const s of input.subscriptions) {
    events.push({ kind: 'subscription_started', at: s.startedAt, titleHt: null, titleFr: null, amountCents: s.priceCents, code: null });
    if (s.status === 'canceled') {
      events.push({ kind: 'subscription_canceled', at: s.currentPeriodEnd ?? s.startedAt, titleHt: null, titleFr: null, amountCents: null, code: null });
    } else if (s.status === 'past_due') {
      events.push({ kind: 'subscription_past_due', at: s.currentPeriodEnd ?? s.startedAt, titleHt: null, titleFr: null, amountCents: null, code: null });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}

/* --------------------------------- bundle --------------------------------- */

export type MyAccountData = {
  subscriptions: MySubscription[];
  purchases: MyPurchase[];
  certificates: MyCertificate[];
  tickets: MyTicket[];
  events: AccountEvent[];
};

const EMPTY_ACCOUNT: MyAccountData = {
  subscriptions: [],
  purchases: [],
  certificates: [],
  tickets: [],
  events: [],
};

/**
 * Everything /kont's real tabs need, in one gated read. NEVER THROWS —
 * empty bundle on any failure (the tabs then show their empty states).
 */
export async function getMyAccountData(clerkId: string): Promise<MyAccountData> {
  if (!dbReady() || !clerkId) return EMPTY_ACCOUNT;
  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return EMPTY_ACCOUNT;

    const [subscriptions, paymentRows, certRows, ticketRows, courses] = await Promise.all([
      buildMySubscriptions(userId),
      paymentsSelectSafe(
        () =>
          db
            .select()
            .from(T.payments)
            .where(eq(T.payments.userId, userId))
            .orderBy(desc(T.payments.createdAt)),
        () =>
          db
            .select(PAYMENTS_COLUMNS_PRE_0019)
            .from(T.payments)
            .where(eq(T.payments.userId, userId))
            .orderBy(desc(T.payments.createdAt)),
      ),
      db
        .select()
        .from(T.certificates)
        .where(eq(T.certificates.userId, userId))
        .orderBy(desc(T.certificates.issuedAt)),
      db
        .select()
        .from(T.supportTickets)
        .where(eq(T.supportTickets.userId, userId))
        .orderBy(desc(T.supportTickets.updatedAt)),
      getAllCourses(),
    ]);

    const courseBySlug = new Map(courses.map((c) => [c.slug, c]));
    const titles = (slug: string | null): { ht: string | null; fr: string | null } => {
      if (!slug) return { ht: null, fr: null };
      const c = courseBySlug.get(slug);
      return { ht: c?.title_ht ?? slug, fr: c?.title_fr ?? slug };
    };

    const purchases: MyPurchase[] = paymentRows.map((p) => {
      const t = titles(p.courseSlug);
      return {
        id: p.id,
        dateIso: iso(p.createdAt)!,
        productType: p.productType,
        courseSlug: p.courseSlug,
        titleHt: t.ht,
        titleFr: t.fr,
        amountCents: p.amountCents,
        currency: p.currency,
        status: p.status,
        reference: p.providerRef,
        receiptAvailable: p.status === 'completed' || p.status === 'refunded',
      };
    });

    const certificates: MyCertificate[] = certRows
      .filter((c) => !c.revoked)
      .map((c) => {
        const t = titles(c.courseSlug);
        return {
          courseSlug: c.courseSlug,
          titleHt: t.ht ?? c.courseSlug,
          titleFr: t.fr ?? c.courseSlug,
          code: c.verificationCode,
          issuedAt: iso(c.issuedAt)!,
          revoked: c.revoked,
        };
      });

    const ticketIds = ticketRows.map((t) => t.id);
    const replyRows = ticketIds.length
      ? await db.select().from(T.supportReplies).where(inArray(T.supportReplies.ticketId, ticketIds))
      : [];
    const repliesByTicket = new Map<string, MyTicketReply[]>();
    for (const r of replyRows) {
      const list = repliesByTicket.get(r.ticketId) ?? [];
      list.push({
        id: r.id,
        authorType: r.authorType,
        authorName: r.authorName,
        body: r.body,
        createdAt: iso(r.createdAt)!,
      });
      repliesByTicket.set(r.ticketId, list);
    }
    const tickets: MyTicket[] = ticketRows.map((t) => ({
      id: t.id,
      type: t.type,
      subject: t.subject,
      message: t.message,
      status: t.status,
      createdAt: iso(t.createdAt)!,
      updatedAt: iso(t.updatedAt)!,
      replies: (repliesByTicket.get(t.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));

    return {
      subscriptions,
      purchases,
      certificates,
      tickets,
      events: deriveAccountEvents({ purchases, certificates, subscriptions }),
    };
  } catch (err) {
    console.error('[learner/account] getMyAccountData failed:', err);
    return EMPTY_ACCOUNT;
  }
}

/**
 * One ticket + its thread, OWNER-ONLY: resolves the signed-in learner's own
 * users.id first and returns `null` whenever the ticket doesn't belong to
 * them — a foreign ticket id behaves exactly like a missing one (no
 * existence leak). Unit-tested in account.test.ts.
 */
export async function getMyTicketThread(clerkId: string, ticketId: string): Promise<MyTicket | null> {
  if (!dbReady() || !clerkId || !ticketId) return null;
  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return null;

    const [t] = await db
      .select()
      .from(T.supportTickets)
      .where(eq(T.supportTickets.id, ticketId))
      .limit(1);
    if (!t || t.userId !== userId) return null;

    const replyRows = await db
      .select()
      .from(T.supportReplies)
      .where(eq(T.supportReplies.ticketId, t.id));
    return {
      id: t.id,
      type: t.type,
      subject: t.subject,
      message: t.message,
      status: t.status,
      createdAt: iso(t.createdAt)!,
      updatedAt: iso(t.updatedAt)!,
      replies: replyRows
        .map((r) => ({
          id: r.id,
          authorType: r.authorType,
          authorName: r.authorName,
          body: r.body,
          createdAt: iso(r.createdAt)!,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  } catch (err) {
    console.error('[learner/account] getMyTicketThread failed:', err);
    return null;
  }
}
