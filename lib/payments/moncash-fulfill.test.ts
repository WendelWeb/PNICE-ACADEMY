/**
 * Stage 2 (money-exactness pass) — lib/payments/moncash-fulfill.ts used to
 * accept `amountHtg` (the gourdes MonCash actually reported charging) and
 * then throw it away: never written to any column, so the receipt (email
 * and PDF) could only ever re-derive an HTG figure from whatever FX rate was
 * live when it was rendered — which drifted forever after the sale and, on
 * the one real production MonCash sale, was already wrong the moment the
 * receipt was first sent (264 HTG really charged vs. 250 HTG shown).
 *
 * This suite proves the fix, DB-mocked (fulfill.refunds.test.ts's pattern,
 * extended with a working `.returning()` since fulfillMoncashOrder actually
 * consumes the inserted payment id):
 *  - the real charged amount is persisted onto `payments.amount_htg`,
 *    rounded to the nearest whole gourde;
 *  - a provider delivery that didn't disclose an amount (0) is stored as
 *    NULL, never as a fake "0 HTG" fact;
 *  - the receipt email is built with that EXACT figure (`htgExact`), never a
 *    fresh `getFxRate()` re-derivation, when it is known;
 *  - only the rare no-amount delivery falls back to the live-rate estimate,
 *    and only then is `getFxRate()` even called;
 *  - the idempotent self-heal ("already recorded") path sends no email at
 *    all, so no re-derivation can happen on a MonCash redelivery either.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as AnyRow[][],
  insertReturningQueue: [] as AnyRow[][],
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
    b.returning = () =>
      Promise.resolve(dbState.insertReturningQueue.length > 0 ? dbState.insertReturningQueue.shift() : []);
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
}));
vi.mock('@/lib/courses/source', () => ({
  getCourseBySlug: vi.fn(async () => ({ title_fr: 'Cours', title_ht: 'Kou' })),
}));

const emailState = vi.hoisted(() => ({ configured: true, sendCalls: [] as AnyRow[] }));
vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn(async (args: AnyRow) => {
    emailState.sendCalls.push(args);
    return { sent: true };
  }),
  emailConfigured: () => emailState.configured,
}));

const receiptState = vi.hoisted(() => ({ calls: [] as AnyRow[] }));
vi.mock('@/lib/email/templates', () => ({
  buildReceiptHtml: vi.fn((args: AnyRow) => {
    receiptState.calls.push(args);
    return { subject: 'sub', html: '<p>receipt</p>', text: 'receipt' };
  }),
}));

const fxState = vi.hoisted(() => ({ rate: 135 }));
vi.mock('@/lib/fx', () => ({
  getFxRate: vi.fn(async () => fxState.rate),
}));

import { fulfillMoncashOrder } from './moncash-fulfill';
import { getFxRate } from '@/lib/fx';
import { buildReceiptHtml } from '@/lib/email/templates';

const BASE_INPUT = {
  orderId: 'order-1',
  userDbId: 'user-1',
  courseSlug: 'kou-1',
  usdCentsEquivalent: 200, // $2.00 — the real production sale's price
  transactionId: 'txn-1',
  locale: 'ht' as const,
};

const USER_ROW = { id: 'user-1', name: 'Jean', email: 'jean@example.com' };

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.insertReturningQueue = [];
  dbState.updates = [];
  dbState.inserts = [];
  emailState.configured = true;
  emailState.sendCalls = [];
  receiptState.calls = [];
  fxState.rate = 135;
  vi.mocked(getFxRate).mockClear();
  vi.mocked(buildReceiptHtml).mockClear();
});

/** Queues the full "brand-new payment" call sequence: no existing row, the
 *  insert returns a fresh id, no prior enrollment, then (if email is
 *  configured) the receipt-email user lookup. */
function queueNewSaleSelects() {
  dbState.selectQueue = [
    [], // 1. existing payment? no
    [], // 2. ensureCourseEnrollment: already active? no
    [USER_ROW], // 3. sendMoncashReceipt: user row
  ];
  dbState.insertReturningQueue = [[{ id: 'payment-1' }]];
}

describe('fulfillMoncashOrder — persists the REAL gourdes charged (Stage 2 money-exactness pass)', () => {
  it('stores the reported amountHtg, rounded to the nearest whole gourde, on the payments row', async () => {
    queueNewSaleSelects();
    const outcome = await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 263.6 });
    expect(outcome).toBe('processed');

    const paymentInsert = dbState.inserts.find((i) => 'amountHtg' in i.values);
    expect(paymentInsert).toBeDefined();
    expect(paymentInsert!.values).toMatchObject({
      provider: 'moncash',
      amountCents: 200,
      currency: 'usd',
      amountHtg: 264, // Math.round(263.6)
    });
  });

  it('reproduces the real production sale exactly: usdCentsToHtg(200, 132) = 264', async () => {
    queueNewSaleSelects();
    await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 264 });
    const paymentInsert = dbState.inserts.find((i) => 'amountHtg' in i.values);
    expect(paymentInsert!.values.amountHtg).toBe(264);
  });

  it('stores NULL, never 0, when the provider delivery did not disclose an amount', async () => {
    queueNewSaleSelects();
    await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 0 });
    const paymentInsert = dbState.inserts.find((i) => 'amountHtg' in i.values);
    expect(paymentInsert!.values.amountHtg).toBeNull();
  });

  it('never overwrites/re-derives amountHtg on the self-heal ("already recorded") path', async () => {
    dbState.selectQueue = [
      [{ id: 'payment-1' }], // existing payment found
      [], // ensureCourseEnrollment: not already active
    ];
    const outcome = await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 264 });
    expect(outcome).toBe('already');
    // No payments insert at all on the self-heal path.
    expect(dbState.inserts.find((i) => 'amountHtg' in i.values)).toBeUndefined();
  });
});

describe('fulfillMoncashOrder — the receipt email shows the EXACT charge, not a live re-derivation', () => {
  it('passes the exact stored htg to buildReceiptHtml and never calls getFxRate()', async () => {
    queueNewSaleSelects();
    await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 264 });

    expect(receiptState.calls).toHaveLength(1);
    expect(receiptState.calls[0]).toMatchObject({ htgExact: 264, rateHtg: undefined, amountCents: 200 });
    expect(getFxRate).not.toHaveBeenCalled();
  });

  it('a later FX-rate change cannot affect what was just charged: htgExact is fixed regardless of fxState.rate', async () => {
    fxState.rate = 200; // wildly different from the sale-time rate — must not matter
    queueNewSaleSelects();
    await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 264 });
    expect(receiptState.calls[0]).toMatchObject({ htgExact: 264 });
    expect(getFxRate).not.toHaveBeenCalled();
  });

  it('falls back to a live-rate ESTIMATE only when no real amount was ever disclosed', async () => {
    queueNewSaleSelects();
    await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 0 });

    expect(getFxRate).toHaveBeenCalledTimes(1);
    expect(receiptState.calls[0]).toMatchObject({ htgExact: undefined, rateHtg: 135 });
  });

  it('sends no receipt at all on the self-heal path — no email, no re-derivation, on a MonCash redelivery', async () => {
    dbState.selectQueue = [
      [{ id: 'payment-1' }], // existing payment found
      [], // ensureCourseEnrollment: not already active
    ];
    await fulfillMoncashOrder({ ...BASE_INPUT, amountHtg: 264 });
    expect(receiptState.calls).toHaveLength(0);
    expect(emailState.sendCalls).toHaveLength(0);
    expect(getFxRate).not.toHaveBeenCalled();
  });
});
