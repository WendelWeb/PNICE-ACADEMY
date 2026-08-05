/**
 * Stage: learner account — webhook handling for customer.subscription.
 * updated/deleted (lib/payments/fulfill.ts). DB-mocked (the write.resources
 * pattern: a queue of select results + recorders for update/insert), proving:
 *  - updated maps Stripe's status onto ours and writes cancel flag + period;
 *  - updated raises the 'sub_canceled' notification itself the FIRST time it
 *    transitions a row into canceled (launch review fix — Stripe's ordinary
 *    cancellation flow delivers .updated BEFORE .deleted for the SAME
 *    cancellation), and never re-notifies a redelivery/out-of-order update
 *    that finds the row already canceled;
 *  - deleted cancels once, notifies once, and a REDELIVERY is a pure ack
 *    (no second status write, no second admin notification) — idempotency;
 *  - an unknown subscription id is 'ignored' for both, never a throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as AnyRow[][],
  updates: [] as { set: AnyRow }[],
  inserts: [] as { values: AnyRow }[],
}));

vi.mock('@/db', async () => {
  const schema = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  const makeSelect = () => {
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
  const makeUpdate = () => {
    const rec = { set: {} as AnyRow };
    dbState.updates.push(rec);
    const b: Record<string, unknown> = {};
    b.set = (s: AnyRow) => {
      rec.set = s;
      return b;
    };
    b.where = () => b;
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onF, onR);
    return b;
  };
  const makeInsert = () => {
    const rec = { values: {} as AnyRow };
    dbState.inserts.push(rec);
    const b: Record<string, unknown> = {};
    b.values = (v: AnyRow) => {
      rec.values = v;
      return b;
    };
    b.onConflictDoNothing = () => b;
    b.onConflictDoUpdate = () => b;
    b.returning = () => Promise.resolve([]);
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onF, onR);
    return b;
  };
  return {
    db: {
      select: () => makeSelect(),
      update: () => makeUpdate(),
      insert: () => makeInsert(),
    },
    schema,
    isMissingColumnError: () => false,
  };
});

// Side-effect modules of OTHER fulfill paths — not under test, kept inert.
vi.mock('@/lib/teacher/earnings', () => ({
  recordSaleEarning: vi.fn(async () => undefined),
  recordRefundReversal: vi.fn(async () => undefined),
}));
vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn(async () => ({ sent: false, skipped: true })),
  emailConfigured: () => false,
}));
vi.mock('@/lib/pdf/receipt', () => ({ buildReceiptPdf: vi.fn(async () => new Uint8Array()) }));

import { fulfillAction } from './fulfill';
import type { StripeAction } from './stripe-events';

const SUB_ROW = {
  id: 'sub-row-1',
  userId: 'user-1',
  status: 'active',
  provider: 'stripe',
  providerRef: 'sub_stripe_1',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  teacherPlanId: null,
  kind: 'platform',
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

const updated = (over: Partial<Extract<StripeAction, { kind: 'subscription_updated' }>> = {}): StripeAction => ({
  kind: 'subscription_updated',
  eventId: 'evt_u1',
  subscriptionId: 'sub_stripe_1',
  status: 'past_due',
  cancelAtPeriodEnd: true,
  periodEnd: 1760000000,
  ...over,
});

const deleted = (): StripeAction => ({
  kind: 'subscription_deleted',
  eventId: 'evt_d1',
  subscriptionId: 'sub_stripe_1',
});

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.updates = [];
  dbState.inserts = [];
});

describe('fulfillAction — customer.subscription.updated', () => {
  it('maps status/cancel flag/period end onto our row', async () => {
    dbState.selectQueue = [[SUB_ROW]];
    const outcome = await fulfillAction(updated());
    expect(outcome).toBe('processed');
    expect(dbState.updates).toHaveLength(1);
    const set = dbState.updates[0].set;
    expect(set.status).toBe('past_due');
    expect(set.cancelAtPeriodEnd).toBe(true);
    expect((set.currentPeriodEnd as Date).getTime()).toBe(1760000000 * 1000);
    expect(dbState.inserts).toHaveLength(0); // no notification on a mere update
  });

  it('is idempotent: the same event redelivered produces the identical write', async () => {
    dbState.selectQueue = [[SUB_ROW]];
    await fulfillAction(updated());
    // Redelivery: the row now already carries the mapped state.
    dbState.selectQueue = [[{ ...SUB_ROW, status: 'past_due', cancelAtPeriodEnd: true }]];
    const outcome = await fulfillAction(updated());
    expect(outcome).toBe('processed');
    expect(dbState.updates).toHaveLength(2);
    const [first, second] = dbState.updates.map((u) => u.set);
    expect(second.status).toBe(first.status);
    expect(second.cancelAtPeriodEnd).toBe(first.cancelAtPeriodEnd);
    expect((second.currentPeriodEnd as Date).getTime()).toBe((first.currentPeriodEnd as Date).getTime());
  });

  it('leaves currentPeriodEnd untouched when the event carries none', async () => {
    dbState.selectQueue = [[SUB_ROW]];
    await fulfillAction(updated({ periodEnd: null }));
    expect(dbState.updates[0].set).not.toHaveProperty('currentPeriodEnd');
  });

  it("ignores a subscription that isn't ours", async () => {
    dbState.selectQueue = [[]];
    const outcome = await fulfillAction(updated());
    expect(outcome).toBe('ignored');
    expect(dbState.updates).toHaveLength(0);
  });

  // Fix (launch review pass): Stripe's ordinary cancellation flow sends
  // .updated (status → canceled) BEFORE .deleted for the SAME cancellation —
  // so .updated must be the one that actually notifies, or the admin bell
  // never fires for the mainstream path (fulfillSubscriptionDeleted finds
  // the row already canceled and stays silent).
  it("raises the 'sub_canceled' admin notification the FIRST time it transitions a row into canceled", async () => {
    dbState.selectQueue = [[SUB_ROW]]; // was 'active'
    const outcome = await fulfillAction(updated({ status: 'canceled', cancelAtPeriodEnd: false }));
    expect(outcome).toBe('processed');
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set.status).toBe('canceled');
    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].values.kind).toBe('sub_canceled');
    expect(dbState.inserts[0].values.userId).toBe('user-1');
  });

  it('does NOT re-notify when a redelivered/out-of-order update finds the row already canceled', async () => {
    dbState.selectQueue = [[{ ...SUB_ROW, status: 'canceled' }]];
    const outcome = await fulfillAction(updated({ status: 'canceled', cancelAtPeriodEnd: false }));
    expect(outcome).toBe('processed');
    expect(dbState.updates).toHaveLength(1); // status write still happens (idempotent SET)
    expect(dbState.inserts).toHaveLength(0); // but no second notification
  });
});

describe('fulfillAction — customer.subscription.deleted', () => {
  it('cancels the row and raises ONE admin notification', async () => {
    dbState.selectQueue = [[SUB_ROW]];
    const outcome = await fulfillAction(deleted());
    expect(outcome).toBe('processed');
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set.status).toBe('canceled');
    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].values.kind).toBe('sub_canceled');
    expect(dbState.inserts[0].values.userId).toBe('user-1');
  });

  it('idempotent: an already-canceled row is acked with NO second write or notification', async () => {
    dbState.selectQueue = [[{ ...SUB_ROW, status: 'canceled' }]];
    const outcome = await fulfillAction(deleted());
    expect(outcome).toBe('processed');
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
  });

  it("ignores a subscription that isn't ours", async () => {
    dbState.selectQueue = [[]];
    const outcome = await fulfillAction(deleted());
    expect(outcome).toBe('ignored');
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
  });
});
