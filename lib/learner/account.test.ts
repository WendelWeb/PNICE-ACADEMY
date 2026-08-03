/**
 * Stage: learner account — learner-scoped account reads (lib/learner/
 * account.ts). Two layers:
 *  1. `getMyTicketThread` OWNER-ONLY semantics, DB-mocked (the
 *     write.resources pattern): a ticket belonging to someone else returns
 *     `null` exactly like a missing one — no existence leak, no replies
 *     read.
 *  2. `deriveAccountEvents` — the honest notifications feed — pure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// clerkEnabled + dbReady() are import-time / env reads — set both BEFORE the
// module under test loads so its gates are open in this suite.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';
  process.env.DATABASE_URL = 'postgres://mock/mock';
});

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as AnyRow[][],
  selectCalls: 0,
}));

vi.mock('@/db', async () => {
  const schema = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  const makeSelect = () => {
    dbState.selectCalls += 1;
    const result = dbState.selectQueue.length > 0 ? (dbState.selectQueue.shift() as AnyRow[]) : [];
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.from = chain;
    b.where = chain;
    b.limit = chain;
    b.orderBy = chain;
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR);
    return b;
  };
  return {
    db: { select: () => makeSelect() },
    schema,
    isMissingColumnError: () => false,
  };
});

import { deriveAccountEvents, getMyTicketThread } from './account';
import type { MyCertificate, MyPurchase, MySubscription } from './account';

const OWNER_USERS_ROW = [{ id: 'user-owner' }];

const TICKET = {
  id: 'ticket-1',
  userId: 'user-owner',
  type: 'question',
  subject: 'Kesyon mwen',
  message: 'Mesaj orijinal la',
  status: 'in_progress',
  assignedAdminId: null,
  assignedAdminName: null,
  relatedPaymentId: null,
  createdAt: new Date('2026-07-20T10:00:00Z'),
  updatedAt: new Date('2026-07-21T10:00:00Z'),
};

const REPLIES = [
  {
    id: 'r2',
    ticketId: 'ticket-1',
    authorType: 'user',
    authorId: 'user-owner',
    authorName: 'Mari',
    body: 'Mèsi!',
    createdAt: new Date('2026-07-21T09:00:00Z'),
  },
  {
    id: 'r1',
    ticketId: 'ticket-1',
    authorType: 'admin',
    authorId: 'admin_1',
    authorName: 'Ekip PNICE',
    body: 'Men repons lan',
    createdAt: new Date('2026-07-20T12:00:00Z'),
  },
];

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectCalls = 0;
});

describe('getMyTicketThread — owner-only', () => {
  it('returns the thread (replies sorted ascending) for the ticket OWNER', async () => {
    dbState.selectQueue = [OWNER_USERS_ROW, [TICKET], REPLIES];
    const thread = await getMyTicketThread('clerk_owner', 'ticket-1');
    expect(thread).not.toBeNull();
    expect(thread?.subject).toBe('Kesyon mwen');
    expect(thread?.status).toBe('in_progress');
    expect(thread?.replies.map((r) => r.id)).toEqual(['r1', 'r2']); // ascending
    expect(thread?.replies[0].authorType).toBe('admin');
  });

  it("returns null for someone ELSE's ticket — and never reads its replies", async () => {
    dbState.selectQueue = [[{ id: 'user-intruder' }], [TICKET]];
    const thread = await getMyTicketThread('clerk_intruder', 'ticket-1');
    expect(thread).toBeNull();
    // users lookup + ticket lookup only — the replies select never fired.
    expect(dbState.selectCalls).toBe(2);
  });

  it('returns null for a missing ticket (same shape as foreign — no existence leak)', async () => {
    dbState.selectQueue = [OWNER_USERS_ROW, []];
    expect(await getMyTicketThread('clerk_owner', 'ticket-missing')).toBeNull();
  });

  it('returns null with no users row (signed-in but never synced)', async () => {
    dbState.selectQueue = [[]];
    expect(await getMyTicketThread('clerk_ghost', 'ticket-1')).toBeNull();
  });
});

describe('deriveAccountEvents', () => {
  const purchase = (over: Partial<MyPurchase>): MyPurchase => ({
    id: 'p1',
    dateIso: '2026-07-10T00:00:00.000Z',
    productType: 'course',
    courseSlug: 'kou-a',
    titleHt: 'Kou A',
    titleFr: 'Cours A',
    amountCents: 900,
    currency: 'USD',
    status: 'completed',
    reference: 'pi_1',
    receiptAvailable: true,
    ...over,
  });
  const cert: MyCertificate = {
    courseSlug: 'kou-a',
    titleHt: 'Kou A',
    titleFr: 'Cours A',
    code: 'PA-ABC23456',
    issuedAt: '2026-07-15T00:00:00.000Z',
    revoked: false,
  };
  const sub = (over: Partial<MySubscription>): MySubscription => ({
    id: 's1',
    kind: 'platform',
    status: 'active',
    provider: 'stripe',
    teacherName: null,
    priceCents: 7900,
    startedAt: '2026-07-01T00:00:00.000Z',
    currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    portalEligible: true,
    ...over,
  });

  it('derives only truthful events, newest first', () => {
    const events = deriveAccountEvents({
      purchases: [purchase({}), purchase({ id: 'p2', status: 'pending', dateIso: '2026-07-30T00:00:00.000Z' })],
      certificates: [cert],
      subscriptions: [sub({})],
    });
    // pending purchase produces NO event; the rest sort desc.
    expect(events.map((e) => e.kind)).toEqual(['certificate', 'purchase', 'subscription_started']);
    expect(events[0].code).toBe('PA-ABC23456');
  });

  it('maps refunds and subscription state changes', () => {
    const events = deriveAccountEvents({
      purchases: [purchase({ status: 'refunded' })],
      certificates: [],
      subscriptions: [sub({ status: 'canceled' }), sub({ id: 's2', status: 'past_due' })],
    });
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('refund');
    expect(kinds).toContain('subscription_canceled');
    expect(kinds).toContain('subscription_past_due');
  });

  it('caps the feed at 30 events', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      purchase({ id: `p${i}`, dateIso: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    expect(deriveAccountEvents({ purchases: many, certificates: [], subscriptions: [] })).toHaveLength(30);
  });
});
