/**
 * Stage 2 (money-exactness pass) — lib/admin/data/real/users.ts's
 * `refundPayment` (the Transactions console's "Rembourser" button — the
 * ONLY refund path that exists for MonCash, which has no scriptable refund
 * API of its own) used to ONLY flip `payments.status` and credit the buyer's
 * account: the learner's enrollment stayed active no matter how the refund
 * was recorded.
 *
 * This suite proves that half of the fix, DB-mocked (the
 * fulfill.refunds.test.ts pattern): a refund now ALSO revokes the
 * enrollment it granted, for a course purchase; a subscription payment
 * (which has no per-payment enrollment row) is refunded without touching
 * enrollments; and the existing "already refunded / never completed"
 * idempotency guard still makes a repeat click a true no-op.
 *
 * The OTHER half of the fix — reversing the teacher's earnings-ledger 'sale'
 * row via `recordRefundReversal` — deliberately does NOT live in this
 * function (see its doc comment: a client-bundle boundary issue forces that
 * call out to the 'use server' callers instead). That half is covered by
 * lib/admin/refund-reversal.test.ts, against `refundPaymentAction` and
 * `refundFromTicketAction` — the two real callers.
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

import { refundPayment } from './users';

const ADMIN = { id: 'admin-1', name: 'Admin', role: 'admin' } as unknown as Parameters<typeof refundPayment>[0]['admin'];

const COURSE_PAYMENT = {
  id: 'payment-1',
  userId: 'user-1',
  provider: 'moncash',
  amountCents: 200,
  currency: 'usd',
  status: 'completed',
  productType: 'course',
  courseSlug: 'kou-1',
};

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.updates = [];
  dbState.inserts = [];
});

describe('refundPayment — a MonCash (or manually-issued Stripe) refund revokes the access it granted, not just the label', () => {
  it('flips payment status, credits the buyer, AND revokes the course enrollment', async () => {
    dbState.selectQueue = [[COURSE_PAYMENT]];
    await refundPayment({ userId: 'user-1', paymentId: 'payment-1', admin: ADMIN });

    // payments.status -> 'refunded', enrollments.status -> 'refunded'.
    expect(dbState.updates).toHaveLength(2);
    expect(dbState.updates[0].set).toEqual({ status: 'refunded' });
    expect(dbState.updates[1].set).toEqual({ status: 'refunded' });

    // Store credit for exactly what was charged (200 cents — a discounted
    // sale's payments.amountCents is already the discounted total, so this
    // is correct for a promo-discounted MonCash/Stripe sale too, not just a
    // full-price one).
    const creditInsert = dbState.inserts.find((i) => i.values.reason === 'refund');
    expect(creditInsert?.values).toMatchObject({ userId: 'user-1', amountCents: 200, relatedId: 'payment-1' });

    // recordAudit's own insert (audit_log) is the only other insert.
    expect(dbState.inserts).toHaveLength(2);
  });

  it('does NOT touch enrollments for a subscription payment (no per-payment enrollment row exists)', async () => {
    dbState.selectQueue = [[{ ...COURSE_PAYMENT, productType: 'subscription', courseSlug: null }]];
    await refundPayment({ userId: 'user-1', paymentId: 'payment-1', admin: ADMIN });

    expect(dbState.updates).toHaveLength(1); // payments.status only
    expect(dbState.updates[0].set).toEqual({ status: 'refunded' });
  });

  it('is idempotent: an already-refunded payment writes nothing new (no double credit)', async () => {
    dbState.selectQueue = [[{ ...COURSE_PAYMENT, status: 'refunded' }]];
    await refundPayment({ userId: 'user-1', paymentId: 'payment-1', admin: ADMIN });

    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts.find((i) => i.values.reason === 'refund')).toBeUndefined();
    // The audit-log row is still written — the admin's click is still on
    // record, even though nothing else moved.
    expect(dbState.inserts).toHaveLength(1);
  });

  it('is a no-op (besides the audit row) for a payment id that does not exist', async () => {
    dbState.selectQueue = [[]];
    await refundPayment({ userId: 'user-1', paymentId: 'missing', admin: ADMIN });

    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(1);
  });
});
