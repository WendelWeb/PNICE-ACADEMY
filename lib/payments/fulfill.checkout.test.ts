/**
 * Production hardening pass — lib/payments/fulfill.ts's `fulfillCheckoutCompleted`
 * used to grant access purely off `checkout.session.completed` landing at
 * all, with no look at Stripe's own `payment_status`. Stripe explicitly
 * warns this is unsafe for an asynchronous payment method (e.g. US bank
 * debit/ACH): that event can fire while `payment_status` is still 'unpaid',
 * with the real success/failure arriving later on
 * `checkout.session.async_payment_succeeded`/`_failed`.
 *
 * This suite proves the gate added ahead of every DB write: an 'unpaid' (or
 * missing) payment_status is 'ignored' and touches NOTHING, while 'paid' and
 * 'no_payment_required' proceed exactly as before. DB-mocked (the
 * fulfill.subscriptions.test.ts pattern) — the mock would surface a select/
 * insert as a recorded call, so an empty `dbState` after the 'ignored' cases
 * proves no write path was reached.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as AnyRow[][],
  selectCalls: 0,
  insertCalls: 0,
  updateCalls: 0,
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
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR);
    return b;
  };
  const makeInsert = () => {
    dbState.insertCalls += 1;
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.values = chain;
    b.onConflictDoNothing = chain;
    b.returning = () => Promise.resolve([]);
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onF, onR);
    return b;
  };
  const makeUpdate = () => {
    dbState.updateCalls += 1;
    const b: Record<string, unknown> = {};
    b.set = () => b;
    b.where = () => b;
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onF, onR);
    return b;
  };
  return {
    db: { select: () => makeSelect(), insert: () => makeInsert(), update: () => makeUpdate() },
    schema,
    isMissingColumnError: () => false,
  };
});

vi.mock('@/lib/teacher/earnings', () => ({
  recordSaleEarning: vi.fn(async () => undefined),
  recordRefundReversal: vi.fn(async () => undefined),
  recordPartialRefundReversal: vi.fn(async () => 0),
}));
vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn(async () => ({ sent: false, skipped: true })),
  emailConfigured: () => false,
}));
vi.mock('@/lib/pdf/receipt', () => ({ buildReceiptPdf: vi.fn(async () => new Uint8Array()) }));
vi.mock('@/lib/courses/source', () => ({ getCourseBySlug: vi.fn(async () => undefined) }));

import { fulfillAction } from './fulfill';
import type { StripeAction } from './stripe-events';

const checkoutCompleted = (
  over: Partial<Extract<StripeAction, { kind: 'checkout_completed' }>> = {},
): StripeAction => ({
  kind: 'checkout_completed',
  eventId: 'evt_c1',
  sessionId: 'cs_1',
  mode: 'payment',
  userDbId: 'user-1',
  checkoutRowId: null,
  productType: 'course',
  courseSlug: 'kou-1',
  amountCents: 900,
  currency: 'USD',
  paymentIntentId: 'pi_1',
  subscriptionId: null,
  customerEmail: 'x@y.com',
  teacherPlanId: null,
  subscriptionKind: 'platform',
  promoCode: null,
  paymentStatus: 'paid',
  ...over,
});

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectCalls = 0;
  dbState.insertCalls = 0;
  dbState.updateCalls = 0;
});

describe("fulfillAction — checkout_completed's payment_status gate", () => {
  it("'unpaid' is ignored and touches NO db call at all", async () => {
    const outcome = await fulfillAction(checkoutCompleted({ paymentStatus: 'unpaid' }));
    expect(outcome).toBe('ignored');
    expect(dbState.selectCalls).toBe(0);
    expect(dbState.insertCalls).toBe(0);
    expect(dbState.updateCalls).toBe(0);
  });

  it('a missing/null payment_status (pre-field payload) is treated the same as unpaid — ignored, no writes', async () => {
    const outcome = await fulfillAction(checkoutCompleted({ paymentStatus: null }));
    expect(outcome).toBe('ignored');
    expect(dbState.selectCalls).toBe(0);
  });

  it("'paid' proceeds to fulfillment exactly as before (reaches the DB)", async () => {
    // No existing payment (empty select), no existing user row either —
    // this only needs to prove the gate is PASSED, not exercise the whole
    // fulfillment path (that's this file's sole purpose; the rest of
    // fulfillCheckoutCompleted is untouched by this pass).
    dbState.selectQueue = [[], []]; // findPaymentByRef: none, users lookup: none
    await expect(fulfillAction(checkoutCompleted({ paymentStatus: 'paid' }))).rejects.toThrow(/not found/);
    expect(dbState.selectCalls).toBeGreaterThan(0);
  });

  it("'no_payment_required' (a $0 session) also proceeds to fulfillment", async () => {
    dbState.selectQueue = [[], []];
    await expect(
      fulfillAction(checkoutCompleted({ paymentStatus: 'no_payment_required' })),
    ).rejects.toThrow(/not found/);
    expect(dbState.selectCalls).toBeGreaterThan(0);
  });
});
