/**
 * Unit tests for lib/teacher/payouts.ts's gated count reads (Stage 7 —
 * `countPendingWithdrawals` powers the /admin/retraits sidebar badge;
 * `countWithdrawalsByStatus` powers that page's own tab badges). No live DB
 * is touched: this test environment has no DATABASE_URL (vitest.config.ts
 * doesn't load .env.local, same reasoning as lib/teacher/profile.test.ts's
 * header), so every read here runs its `dbConfigured() === false` fallback
 * path.
 */
import { describe, it, expect } from 'vitest';
import { countPendingWithdrawals, countWithdrawalsByStatus, listWithdrawalRequests } from './payouts';

describe('lib/teacher/payouts.ts — gated reads, no DATABASE_URL', () => {
  it('countPendingWithdrawals falls back to 0, never throws', async () => {
    expect(await countPendingWithdrawals()).toBe(0);
  });

  it('countWithdrawalsByStatus falls back to an all-zero record, never throws', async () => {
    expect(await countWithdrawalsByStatus()).toEqual({ pending: 0, paid: 0, rejected: 0 });
  });

  it('listWithdrawalRequests falls back to [], never throws', async () => {
    expect(await listWithdrawalRequests()).toEqual([]);
    expect(await listWithdrawalRequests('pending')).toEqual([]);
  });
});
