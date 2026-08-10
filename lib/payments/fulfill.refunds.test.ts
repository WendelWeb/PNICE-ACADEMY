/**
 * Production hardening pass — lib/payments/fulfill.ts's `fulfillChargeRefunded`
 * used to treat EVERY Stripe refund as a full one: unconditional
 * `payments.status = 'refunded'`, unconditional enrollment revocation, a
 * FULL earnings-ledger reversal, and an email claiming the whole charge was
 * refunded — even for a small partial/goodwill refund. This suite proves the
 * fix, DB-mocked (the fulfill.subscriptions.test.ts pattern):
 *  - a FULL refund (`fullyRefunded: true`) keeps the exact original
 *    behavior: payment → 'refunded', enrollment → 'refunded',
 *    `recordRefundReversal` called, one admin notification for the full
 *    amount, one email with `fullRefund: true`;
 *  - a PARTIAL refund (`fullyRefunded: false`) does NONE of that: no status
 *    flip, no enrollment write, `recordPartialRefundReversal` called
 *    instead of the full reversal, and — only when that call reports a
 *    nonzero delta — one notification/email for the ACTUAL refunded amount
 *    with `fullRefund: false`;
 *  - a partial-refund redelivery that reports a zero delta (nothing new to
 *    reverse) raises NO notification and sends NO email — true idempotency;
 *  - an already-fully-refunded payment short-circuits before either branch,
 *    for both a full and a partial redelivery.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as AnyRow[][],
  updates: [] as { table: string; set: AnyRow }[],
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
    const rec = { table: 'unknown', set: {} as AnyRow };
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

vi.mock('@/lib/teacher/earnings', () => ({
  recordSaleEarning: vi.fn(async () => undefined),
  recordRefundReversal: vi.fn(async () => undefined),
  recordPartialRefundReversal: vi.fn(async () => 0),
}));
vi.mock('@/lib/courses/source', () => ({
  getCourseBySlug: vi.fn(async () => ({ title_fr: 'Cours', title_ht: 'Kou' })),
}));
vi.mock('@/lib/pdf/receipt', () => ({ buildReceiptPdf: vi.fn(async () => new Uint8Array()) }));

const emailState = vi.hoisted(() => ({ sendCalls: [] as AnyRow[], refundCalls: [] as AnyRow[] }));
vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn(async (args: AnyRow) => {
    emailState.sendCalls.push(args);
    return { sent: false, skipped: true };
  }),
  emailConfigured: () => false,
}));
vi.mock('@/lib/email/templates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email/templates')>('@/lib/email/templates');
  return {
    ...actual,
    buildRefundConfirmationHtml: (args: AnyRow) => {
      emailState.refundCalls.push(args);
      return (actual as unknown as { buildRefundConfirmationHtml: (a: AnyRow) => unknown }).buildRefundConfirmationHtml(args);
    },
  };
});

import { fulfillAction } from './fulfill';
import { recordRefundReversal, recordPartialRefundReversal } from '@/lib/teacher/earnings';
import type { StripeAction } from './stripe-events';

const PAYMENT_ROW = {
  id: 'payment-1',
  userId: 'user-1',
  provider: 'stripe',
  providerRef: 'pi_1',
  amountCents: 4900,
  currency: 'USD',
  status: 'completed',
  productType: 'course',
  courseSlug: 'kou-1',
  relatedSubscriptionId: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
};

const USER_ROW = { id: 'user-1', name: 'Jean', email: 'jean@example.com', localePref: 'ht' };

const refundEvent = (over: Partial<Extract<StripeAction, { kind: 'charge_refunded' }>> = {}): StripeAction => ({
  kind: 'charge_refunded',
  eventId: 'evt_r1',
  paymentIntentId: 'pi_1',
  amountRefundedCents: 4900,
  fullyRefunded: true,
  ...over,
});

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.updates = [];
  dbState.inserts = [];
  emailState.sendCalls = [];
  emailState.refundCalls = [];
  vi.mocked(recordRefundReversal).mockClear().mockResolvedValue(undefined);
  vi.mocked(recordPartialRefundReversal).mockClear().mockResolvedValue(0);
});

describe('fulfillAction — charge.refunded (FULL refund)', () => {
  it('flips payment + enrollment, calls the full reversal, notifies and emails the FULL amount', async () => {
    dbState.selectQueue = [[PAYMENT_ROW], [USER_ROW]];
    const outcome = await fulfillAction(refundEvent({ fullyRefunded: true, amountRefundedCents: 4900 }));
    expect(outcome).toBe('processed');

    expect(dbState.updates).toHaveLength(2); // payments.status, enrollments.status
    expect(dbState.updates[0].set).toEqual({ status: 'refunded' });
    expect(dbState.updates[1].set).toEqual({ status: 'refunded' });

    expect(recordRefundReversal).toHaveBeenCalledWith({ id: 'payment-1' });
    expect(recordPartialRefundReversal).not.toHaveBeenCalled();

    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].values).toMatchObject({ kind: 'refund_request', amountCents: 4900 });

    expect(emailState.refundCalls).toHaveLength(1);
    expect(emailState.refundCalls[0]).toMatchObject({ amountCents: 4900, fullRefund: true });
  });

  it('is idempotent: an already-refunded payment short-circuits before any write', async () => {
    dbState.selectQueue = [[{ ...PAYMENT_ROW, status: 'refunded' }]];
    const outcome = await fulfillAction(refundEvent());
    expect(outcome).toBe('processed');
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
    expect(recordRefundReversal).not.toHaveBeenCalled();
    expect(recordPartialRefundReversal).not.toHaveBeenCalled();
  });

  it('ignores a charge for a payment we never recorded', async () => {
    dbState.selectQueue = [[]];
    const outcome = await fulfillAction(refundEvent());
    expect(outcome).toBe('ignored');
    expect(dbState.updates).toHaveLength(0);
  });
});

describe('fulfillAction — charge.refunded (PARTIAL refund)', () => {
  it('does NOT flip payment/enrollment status and calls the PARTIAL reversal instead', async () => {
    vi.mocked(recordPartialRefundReversal).mockResolvedValue(1000);
    dbState.selectQueue = [[PAYMENT_ROW], [USER_ROW]];
    const outcome = await fulfillAction(refundEvent({ fullyRefunded: false, amountRefundedCents: 1000 }));
    expect(outcome).toBe('processed');

    expect(dbState.updates).toHaveLength(0); // access untouched
    expect(recordPartialRefundReversal).toHaveBeenCalledWith({ id: 'payment-1' }, 1000);
    expect(recordRefundReversal).not.toHaveBeenCalled();
  });

  it('notifies and emails the ACTUAL refunded delta, never the full original charge', async () => {
    vi.mocked(recordPartialRefundReversal).mockResolvedValue(1000);
    dbState.selectQueue = [[PAYMENT_ROW], [USER_ROW]];
    await fulfillAction(refundEvent({ fullyRefunded: false, amountRefundedCents: 1000 }));

    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].values).toMatchObject({ kind: 'refund_request', amountCents: 1000 });
    // NEVER the original payment.amountCents (4900) — that would misstate
    // the refund exactly like the bug this suite guards against.
    expect(dbState.inserts[0].values.amountCents).not.toBe(4900);

    expect(emailState.refundCalls).toHaveLength(1);
    expect(emailState.refundCalls[0]).toMatchObject({ amountCents: 1000, fullRefund: false });
  });

  it('a redelivery reporting a ZERO delta raises no notification and sends no email', async () => {
    vi.mocked(recordPartialRefundReversal).mockResolvedValue(0); // already recorded — nothing new
    dbState.selectQueue = [[PAYMENT_ROW]];
    const outcome = await fulfillAction(refundEvent({ fullyRefunded: false, amountRefundedCents: 1000 }));
    expect(outcome).toBe('processed');
    expect(dbState.inserts).toHaveLength(0);
    expect(emailState.refundCalls).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
  });

  it('is idempotent: an already-FULLY-refunded payment short-circuits even for a partial-shaped event', async () => {
    dbState.selectQueue = [[{ ...PAYMENT_ROW, status: 'refunded' }]];
    const outcome = await fulfillAction(refundEvent({ fullyRefunded: false, amountRefundedCents: 500 }));
    expect(outcome).toBe('processed');
    expect(recordPartialRefundReversal).not.toHaveBeenCalled();
    expect(dbState.inserts).toHaveLength(0);
  });
});
