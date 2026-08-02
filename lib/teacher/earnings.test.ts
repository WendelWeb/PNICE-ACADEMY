/**
 * Unit tests for lib/teacher/earnings.ts (Task C3-T5) — the pure money-split
 * math (`splitEarnings`, `reverseSale`). No live DB is touched: these are the
 * ONE place the 70/30 commission split happens, and the ONE place a refund's
 * reversal is computed, so they're covered here without a DB (mirrors
 * lib/teacher/profile.test.ts's approach for its own pure helpers).
 */
import { describe, it, expect } from 'vitest';
import { splitEarnings, reverseSale, recordSaleEarning, type SaleAmounts } from './earnings';

describe('splitEarnings — the ONE place gross → (commission, net) happens', () => {
  it('splits a $79.00 sale 70/30 (commission 30%)', () => {
    // 7900 * 30 / 100 = 2370 exactly — no rounding ambiguity.
    expect(splitEarnings(7900, 30)).toEqual({ commissionCents: 2370, netCents: 5530 });
  });

  it('teacher keeps 70% of gross (net + commission === gross)', () => {
    const { commissionCents, netCents } = splitEarnings(10000, 30);
    expect(commissionCents + netCents).toBe(10000);
    expect(netCents).toBe(7000);
    expect(commissionCents).toBe(3000);
  });

  it('rounds the commission to the nearest cent on an odd split', () => {
    // 999 * 30 / 100 = 299.7 → rounds to 300.
    expect(splitEarnings(999, 30)).toEqual({ commissionCents: 300, netCents: 699 });
  });

  it('a 0% commission gives the teacher the full gross', () => {
    expect(splitEarnings(5000, 0)).toEqual({ commissionCents: 0, netCents: 5000 });
  });

  it('a 100% commission gives the teacher nothing', () => {
    expect(splitEarnings(5000, 100)).toEqual({ commissionCents: 5000, netCents: 0 });
  });
});

describe('reverseSale — negates a recorded sale into its refund counterpart', () => {
  it('negates gross/commission/net but keeps the frozen commissionPctApplied unchanged', () => {
    const sale: SaleAmounts = { grossCents: 7900, commissionCents: 2370, netCents: 5530, commissionPctApplied: 30 };
    expect(reverseSale(sale)).toEqual({
      grossCents: -7900,
      commissionCents: -2370,
      netCents: -5530,
      commissionPctApplied: 30,
    });
  });

  it('round-trips: reversing twice returns the original amounts', () => {
    const sale: SaleAmounts = { grossCents: 4200, commissionCents: 1260, netCents: 2940, commissionPctApplied: 30 };
    expect(reverseSale(reverseSale(sale))).toEqual(sale);
  });

  it('a reversed sale + the original sums to zero on every cents field', () => {
    const sale: SaleAmounts = { grossCents: 3300, commissionCents: 990, netCents: 2310, commissionPctApplied: 30 };
    const reversed = reverseSale(sale);
    expect(sale.grossCents + reversed.grossCents).toBe(0);
    expect(sale.commissionCents + reversed.commissionCents).toBe(0);
    expect(sale.netCents + reversed.netCents).toBe(0);
  });
});

// Task: two subscription products — the pro-rata payout split seam. A
// 'platform' subscription sale must never reach a teacher's ledger, and
// (money-critical) must never throw even with no DB configured — the skip
// happens BEFORE any DB read, so this is testable with no DATABASE_URL.
describe('recordSaleEarning — platform-pass seam (Task: two subscription products)', () => {
  it('resolves without throwing and writes nothing for a platform subscription sale', async () => {
    await expect(
      recordSaleEarning({
        id: 'payment-1',
        amountCents: 7900,
        currency: 'USD',
        productType: 'subscription',
        courseSlug: null,
        teacherPlanId: null,
        subscriptionKind: 'platform',
      }),
    ).resolves.toBeUndefined();
  });
});
