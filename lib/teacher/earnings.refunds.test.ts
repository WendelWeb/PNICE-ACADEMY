/**
 * Production hardening pass — DB-mocked coverage for the amount-aware
 * refund-reversal engine behind `recordRefundReversal` (full) and
 * `recordPartialRefundReversal` (partial), both in lib/teacher/earnings.ts.
 * Before this pass, a refund ALWAYS reversed the teacher's entire sale
 * regardless of how much Stripe actually refunded. This proves:
 *  - a full reversal (no prior refund rows) writes exactly the negation of
 *    the sale, via the SAME `splitEarnings` rounding the sale itself used;
 *  - a partial reversal writes only the fraction requested;
 *  - a SECOND partial (Stripe's cumulative `amount_refunded` growing) writes
 *    only the NEW delta, never double-counting what a prior call already
 *    reversed;
 *  - a redelivery reporting the SAME cumulative amount writes nothing (a
 *    true no-op — delta === 0);
 *  - a full refund arriving AFTER a partial one reverses only the
 *    remainder, converging exactly on the sale's full amount;
 *  - the target is capped at the sale's own `grossCents` no matter how large
 *    an (untrusted) refunded amount claims to be;
 *  - a missing sale row is a safe no-op for both, never a throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as AnyRow[][],
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
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR);
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
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onF, onR);
    return b;
  };
  return {
    db: { select: () => makeSelect(), insert: () => makeInsert() },
    schema,
    isMissingColumnError: () => false,
  };
});

import { recordRefundReversal, recordPartialRefundReversal } from './earnings';

const SALE_ROW = {
  id: 'ledger-sale-1',
  teacherUserId: 'teacher-1',
  paymentId: 'payment-1',
  kind: 'sale',
  grossCents: 3300,
  commissionPctApplied: 30,
  commissionCents: 990,
  netCents: 2310,
  currency: 'USD',
};

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.inserts = [];
});

describe('recordRefundReversal — full reversal, amount-aware idempotency', () => {
  it('with no prior refund rows, reverses the FULL sale via the same splitEarnings rounding', async () => {
    dbState.selectQueue = [[SALE_ROW], []]; // sale, then existing refunds (none)
    await recordRefundReversal({ id: 'payment-1' });
    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].values).toMatchObject({
      kind: 'refund',
      grossCents: -3300,
      commissionCents: -990,
      netCents: -2310,
      commissionPctApplied: 30,
    });
  });

  it('called a second time (pure redelivery) writes NOTHING further', async () => {
    dbState.selectQueue = [[SALE_ROW], [{ grossCents: -3300 }]]; // already fully reversed
    await recordRefundReversal({ id: 'payment-1' });
    expect(dbState.inserts).toHaveLength(0);
  });

  it('arriving AFTER a partial reversal reverses only the REMAINDER', async () => {
    dbState.selectQueue = [[SALE_ROW], [{ grossCents: -1000 }]]; // 1000 already reversed by a partial
    await recordRefundReversal({ id: 'payment-1' });
    expect(dbState.inserts).toHaveLength(1);
    // remainder = 3300 - 1000 = 2300 → splitEarnings(2300, 30) = {690, 1610}
    expect(dbState.inserts[0].values).toMatchObject({
      grossCents: -2300,
      commissionCents: -690,
      netCents: -1610,
    });
  });

  it('no sale row ⇒ safe no-op, never throws', async () => {
    dbState.selectQueue = [[]];
    await expect(recordRefundReversal({ id: 'payment-missing' })).resolves.toBeUndefined();
    expect(dbState.inserts).toHaveLength(0);
  });
});

describe('recordPartialRefundReversal — partial Stripe refunds', () => {
  it('writes only the requested fraction, and returns the delta reversed', async () => {
    dbState.selectQueue = [[SALE_ROW], []];
    const delta = await recordPartialRefundReversal({ id: 'payment-1' }, 1000);
    expect(delta).toBe(1000);
    expect(dbState.inserts).toHaveLength(1);
    // splitEarnings(1000, 30) = {300, 700}
    expect(dbState.inserts[0].values).toMatchObject({
      kind: 'refund',
      grossCents: -1000,
      commissionCents: -300,
      netCents: -700,
      commissionPctApplied: 30,
    });
  });

  it('a SECOND partial (cumulative amount grown) writes only the NEW delta', async () => {
    dbState.selectQueue = [[SALE_ROW], [{ grossCents: -1000 }]]; // 1000 already reversed
    const delta = await recordPartialRefundReversal({ id: 'payment-1' }, 2000); // cumulative now 2000
    expect(delta).toBe(1000); // 2000 - 1000 already reversed
    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].values.grossCents).toBe(-1000);
  });

  it('a redelivery reporting the SAME cumulative amount is a true no-op (delta 0)', async () => {
    dbState.selectQueue = [[SALE_ROW], [{ grossCents: -1000 }]];
    const delta = await recordPartialRefundReversal({ id: 'payment-1' }, 1000);
    expect(delta).toBe(0);
    expect(dbState.inserts).toHaveLength(0);
  });

  it('never reverses MORE than the sale — an oversized amount is capped at grossCents', async () => {
    dbState.selectQueue = [[SALE_ROW], []];
    const delta = await recordPartialRefundReversal({ id: 'payment-1' }, 999_999);
    expect(delta).toBe(3300); // capped at the sale's own grossCents
    expect(dbState.inserts[0].values.grossCents).toBe(-3300);
  });

  it('no sale row ⇒ safe no-op returning 0, never throws', async () => {
    dbState.selectQueue = [[]];
    await expect(recordPartialRefundReversal({ id: 'payment-missing' }, 500)).resolves.toBe(0);
    expect(dbState.inserts).toHaveLength(0);
  });
});
