/**
 * Unit tests for lib/teacher/reconciliation.ts — the pure aggregation math
 * (no DB needed) plus the gated-fallback contract (mirrors
 * lib/teacher/payouts.test.ts's header: no DATABASE_URL in this test
 * environment, so `getReconciliation` always runs its `dbConfigured() ===
 * false` path here).
 */
import { describe, it, expect } from 'vitest';
import { aggregateReconciliation, getReconciliation } from './reconciliation';

describe('lib/teacher/reconciliation.ts — gated read, no DATABASE_URL', () => {
  it('getReconciliation falls back to an all-zero, empty view, never throws', async () => {
    expect(await getReconciliation()).toEqual({
      totals: {
        salesCommissionCents: 0,
        platformPassCommissionCents: 0,
        platformCommissionCents: 0,
        teacherNetEarnedCents: 0,
        paidOutCents: 0,
        pendingWithdrawalsCents: 0,
        outstandingCents: 0,
      },
      byTeacher: [],
    });
  });
});

describe('aggregateReconciliation — pure math', () => {
  const teacherInfo = new Map([
    ['t1', { name: 'Marie', email: 'marie@example.com' }],
    ['t2', { name: null, email: 'jean@example.com' }],
  ]);

  it('a single sale nets commission/net correctly and leaves the full balance owed', () => {
    const result = aggregateReconciliation(
      [{ teacherUserId: 't1', kind: 'sale', grossCents: 200, commissionCents: 60, netCents: 140 }],
      [],
      [],
      teacherInfo,
    );
    expect(result.totals.salesCommissionCents).toBe(60);
    expect(result.totals.platformCommissionCents).toBe(60);
    expect(result.totals.teacherNetEarnedCents).toBe(140);
    expect(result.totals.outstandingCents).toBe(140);
    expect(result.totals.paidOutCents).toBe(0);
    expect(result.byTeacher).toEqual([
      {
        teacherUserId: 't1',
        teacherName: 'Marie',
        teacherEmail: 'marie@example.com',
        grossSalesCents: 200,
        commissionCents: 60,
        platformPassCents: 0,
        netEarnedCents: 140,
        paidOutCents: 0,
        pendingWithdrawalCents: 0,
        balanceCents: 140,
      },
    ]);
  });

  it('a full refund reverses the sale to zero net-of-refund commission and balance', () => {
    const result = aggregateReconciliation(
      [
        { teacherUserId: 't1', kind: 'sale', grossCents: 200, commissionCents: 60, netCents: 140 },
        { teacherUserId: 't1', kind: 'refund', grossCents: -200, commissionCents: -60, netCents: -140 },
      ],
      [],
      [],
      teacherInfo,
    );
    expect(result.totals.salesCommissionCents).toBe(0);
    expect(result.totals.teacherNetEarnedCents).toBe(0);
    expect(result.totals.outstandingCents).toBe(0);
    expect(result.byTeacher[0].balanceCents).toBe(0);
  });

  it('a paid withdrawal reduces the balance without touching netEarnedCents, and is counted as paidOutCents', () => {
    const result = aggregateReconciliation(
      [
        { teacherUserId: 't1', kind: 'sale', grossCents: 1000, commissionCents: 300, netCents: 700 },
        { teacherUserId: 't1', kind: 'withdrawal', grossCents: 0, commissionCents: 0, netCents: -700 },
      ],
      [{ teacherUserId: 't1', status: 'paid', amountCents: 700 }],
      [],
      teacherInfo,
    );
    expect(result.totals.teacherNetEarnedCents).toBe(700); // still "ever earned"
    expect(result.totals.paidOutCents).toBe(700);
    expect(result.totals.outstandingCents).toBe(0); // fully paid out
    expect(result.byTeacher[0].paidOutCents).toBe(700);
    expect(result.byTeacher[0].balanceCents).toBe(0);
  });

  it('a pending withdrawal is tracked separately and does NOT reduce the balance yet', () => {
    const result = aggregateReconciliation(
      [{ teacherUserId: 't1', kind: 'sale', grossCents: 1000, commissionCents: 300, netCents: 700 }],
      [{ teacherUserId: 't1', status: 'pending', amountCents: 700 }],
      [],
      teacherInfo,
    );
    expect(result.totals.pendingWithdrawalsCents).toBe(700);
    expect(result.totals.paidOutCents).toBe(0);
    expect(result.totals.outstandingCents).toBe(700); // still owed — not yet paid
    expect(result.byTeacher[0].pendingWithdrawalCents).toBe(700);
  });

  it('a rejected withdrawal is neither paid nor pending, and does not move the balance', () => {
    const result = aggregateReconciliation(
      [{ teacherUserId: 't1', kind: 'sale', grossCents: 500, commissionCents: 150, netCents: 350 }],
      [{ teacherUserId: 't1', status: 'rejected', amountCents: 350 }],
      [],
      teacherInfo,
    );
    expect(result.totals.paidOutCents).toBe(0);
    expect(result.totals.pendingWithdrawalsCents).toBe(0);
    expect(result.totals.outstandingCents).toBe(350);
  });

  it('a platform_pass row is already net — no commission double-counted, but it does count toward net earned and balance', () => {
    const result = aggregateReconciliation(
      [{ teacherUserId: 't1', kind: 'platform_pass', grossCents: 100, commissionCents: 0, netCents: 100 }],
      [],
      [],
      teacherInfo,
    );
    expect(result.totals.salesCommissionCents).toBe(0);
    expect(result.byTeacher[0].platformPassCents).toBe(100);
    expect(result.byTeacher[0].netEarnedCents).toBe(100);
    expect(result.byTeacher[0].grossSalesCents).toBe(0); // platform_pass is not a "sale"
  });

  it('computed Pass PNICE periods recover the platform 30% that never enters the ledger', () => {
    const result = aggregateReconciliation(
      [],
      [],
      [
        { grossCents: 1000, ownPoolCents: 700 }, // 30% = 300
        { grossCents: 500, ownPoolCents: 350 }, // 30% = 150
      ],
      teacherInfo,
    );
    expect(result.totals.platformPassCommissionCents).toBe(450);
    expect(result.totals.platformCommissionCents).toBe(450);
    expect(result.totals.salesCommissionCents).toBe(0);
  });

  it('a teacher who only ever had a withdrawal request still gets a row (info resolved, all-zero ledger fields)', () => {
    const result = aggregateReconciliation([], [{ teacherUserId: 't2', status: 'pending', amountCents: 200 }], [], teacherInfo);
    expect(result.byTeacher).toEqual([
      {
        teacherUserId: 't2',
        teacherName: null,
        teacherEmail: 'jean@example.com',
        grossSalesCents: 0,
        commissionCents: 0,
        platformPassCents: 0,
        netEarnedCents: 0,
        paidOutCents: 0,
        pendingWithdrawalCents: 200,
        balanceCents: 0,
      },
    ]);
  });

  it('multiple teachers are kept separate and totals sum across all of them', () => {
    const result = aggregateReconciliation(
      [
        { teacherUserId: 't1', kind: 'sale', grossCents: 200, commissionCents: 60, netCents: 140 },
        { teacherUserId: 't2', kind: 'sale', grossCents: 100, commissionCents: 30, netCents: 70 },
      ],
      [],
      [],
      teacherInfo,
    );
    expect(result.byTeacher).toHaveLength(2);
    expect(result.totals.salesCommissionCents).toBe(90);
    expect(result.totals.teacherNetEarnedCents).toBe(210);
    // Sorted by balanceCents descending.
    expect(result.byTeacher[0].teacherUserId).toBe('t1');
    expect(result.byTeacher[1].teacherUserId).toBe('t2');
  });

  it('empty input produces the all-zero empty view', () => {
    const result = aggregateReconciliation([], [], [], new Map());
    expect(result.byTeacher).toEqual([]);
    expect(result.totals).toEqual({
      salesCommissionCents: 0,
      platformPassCommissionCents: 0,
      platformCommissionCents: 0,
      teacherNetEarnedCents: 0,
      paidOutCents: 0,
      pendingWithdrawalsCents: 0,
      outstandingCents: 0,
    });
  });
});
