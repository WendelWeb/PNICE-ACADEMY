/**
 * Unit tests for lib/teacher/platform-pass-split.ts — the pure pro-rata split
 * math (Task: pro-rata split of PNICE all-access revenue). No DB is touched:
 * these are the ONE place the exact-sum rounding, the carry-forward rule,
 * and the "which completion counts as platform-pass revenue" question are
 * decided, so they're covered here exactly like
 * lib/teacher/earnings.test.ts covers `splitEarnings`.
 */
import { describe, it, expect } from 'vitest';
import {
  monthPeriodRangeUtc,
  monthPeriodOf,
  previousMonthPeriod,
  isPlatformPassCompletion,
  computePlatformPassSplit,
  type ConsumptionRow,
} from './platform-pass-split';
import type { SubscriptionGrant } from '@/lib/learner/access';

describe('period helpers', () => {
  it('monthPeriodRangeUtc gives the UTC [start, end) of a calendar month', () => {
    const { start, end } = monthPeriodRangeUtc('2026-07');
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('monthPeriodRangeUtc handles December → January rollover', () => {
    const { start, end } = monthPeriodRangeUtc('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('monthPeriodRangeUtc throws on a malformed period', () => {
    expect(() => monthPeriodRangeUtc('2026-7')).toThrow();
    expect(() => monthPeriodRangeUtc('not-a-period')).toThrow();
    expect(() => monthPeriodRangeUtc('2026-13')).toThrow();
  });

  it('monthPeriodOf reads the UTC year/month off a Date', () => {
    expect(monthPeriodOf(new Date('2026-08-02T10:00:00Z'))).toBe('2026-08');
    expect(monthPeriodOf(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01');
  });

  it('previousMonthPeriod steps back one calendar month', () => {
    expect(previousMonthPeriod('2026-08')).toBe('2026-07');
  });

  it('previousMonthPeriod handles January → December of the prior year', () => {
    expect(previousMonthPeriod('2026-01')).toBe('2025-12');
  });
});

describe('isPlatformPassCompletion', () => {
  const platformSub: SubscriptionGrant[] = [{ kind: 'platform', teacherPlanId: null }];
  const teacherSub: SubscriptionGrant[] = [{ kind: 'teacher', teacherPlanId: 'plan-a' }];
  const planOwners = new Map([['plan-a', 'owner-a']]);

  it('counts a completion covered only by a platform pass', () => {
    expect(isPlatformPassCompletion(false, platformSub, 'owner-a', new Map())).toBe(true);
  });

  it('excludes a completion covered by a per-course enrollment, even with a platform pass active', () => {
    expect(isPlatformPassCompletion(true, platformSub, 'owner-a', new Map())).toBe(false);
  });

  it("excludes a completion covered by the course owner's own teacher pass", () => {
    expect(isPlatformPassCompletion(false, teacherSub, 'owner-a', planOwners)).toBe(false);
  });

  it('excludes via teacher pass even when a platform pass is ALSO active (already-attributed revenue wins)', () => {
    const both: SubscriptionGrant[] = [...teacherSub, ...platformSub];
    expect(isPlatformPassCompletion(false, both, 'owner-a', planOwners)).toBe(false);
  });

  it("a teacher pass for a DIFFERENT teacher doesn't exclude — still counts if a platform pass is active", () => {
    const otherTeacherSub: SubscriptionGrant[] = [{ kind: 'teacher', teacherPlanId: 'plan-b' }];
    const both: SubscriptionGrant[] = [...otherTeacherSub, ...platformSub];
    expect(isPlatformPassCompletion(false, both, 'owner-a', planOwners)).toBe(true);
  });

  it('no enrollment, no platform pass, only an unrelated teacher pass → not counted at all', () => {
    expect(isPlatformPassCompletion(false, teacherSub, 'owner-z', planOwners)).toBe(false);
  });

  it('no subscriptions at all and no enrollment → not counted', () => {
    expect(isPlatformPassCompletion(false, [], 'owner-a', new Map())).toBe(false);
  });
});

describe('computePlatformPassSplit — exact-sum pro-rata math', () => {
  it('an empty pool (no own share, no carry-in) is a pure no-op', () => {
    const result = computePlatformPassSplit({ ownPoolCents: 0, carryInCents: 0, consumption: [] });
    expect(result).toEqual({ totalPoolCents: 0, distributedCents: 0, carryOutCents: 0, shares: [] });
  });

  it('a non-empty pool with zero consumption carries the WHOLE pool forward', () => {
    const result = computePlatformPassSplit({ ownPoolCents: 5530, carryInCents: 0, consumption: [] });
    expect(result.totalPoolCents).toBe(5530);
    expect(result.distributedCents).toBe(0);
    expect(result.carryOutCents).toBe(5530);
    expect(result.shares).toEqual([]);
  });

  it('carry-in adds to this month\'s own pool before distribution', () => {
    const consumption: ConsumptionRow[] = [{ teacherUserId: 'a', completions: 1 }];
    const result = computePlatformPassSplit({ ownPoolCents: 1000, carryInCents: 500, consumption });
    expect(result.totalPoolCents).toBe(1500);
    expect(result.distributedCents).toBe(1500);
    expect(result.carryOutCents).toBe(0);
    expect(result.shares).toEqual([{ teacherUserId: 'a', completions: 1, shareCents: 1500 }]);
  });

  it('splits proportionally to completions on an exact division', () => {
    const consumption: ConsumptionRow[] = [
      { teacherUserId: 'a', completions: 3 },
      { teacherUserId: 'b', completions: 1 },
    ];
    const result = computePlatformPassSplit({ ownPoolCents: 4000, carryInCents: 0, consumption });
    const byId = Object.fromEntries(result.shares.map((s) => [s.teacherUserId, s.shareCents]));
    expect(byId).toEqual({ a: 3000, b: 1000 });
    expect(result.distributedCents).toBe(4000);
    expect(result.carryOutCents).toBe(0);
  });

  it('sums to EXACTLY the pool on an awkward split (10001¢ over 3 equal teachers)', () => {
    const consumption: ConsumptionRow[] = [
      { teacherUserId: 'teacher-a', completions: 1 },
      { teacherUserId: 'teacher-b', completions: 1 },
      { teacherUserId: 'teacher-c', completions: 1 },
    ];
    const result = computePlatformPassSplit({ ownPoolCents: 10001, carryInCents: 0, consumption });
    const sum = result.shares.reduce((s, r) => s + r.shareCents, 0);
    expect(sum + result.carryOutCents).toBe(10001);
    expect(sum).toBe(10001);
    expect(result.carryOutCents).toBe(0);
    // 10001 / 3 = 3333.67 each — two teachers round up, one doesn't.
    const counts = result.shares.map((s) => s.shareCents).sort((x, y) => x - y);
    expect(counts).toEqual([3333, 3334, 3334]);
  });

  it('sums to EXACTLY the pool on an uneven, many-teacher split', () => {
    const consumption: ConsumptionRow[] = [
      { teacherUserId: 't1', completions: 7 },
      { teacherUserId: 't2', completions: 13 },
      { teacherUserId: 't3', completions: 2 },
      { teacherUserId: 't4', completions: 41 },
      { teacherUserId: 't5', completions: 1 },
    ];
    const result = computePlatformPassSplit({ ownPoolCents: 999_997, carryInCents: 3, consumption });
    const sum = result.shares.reduce((s, r) => s + r.shareCents, 0);
    expect(result.totalPoolCents).toBe(1_000_000);
    expect(sum).toBe(1_000_000);
    expect(result.carryOutCents).toBe(0);
    expect(result.shares.every((s) => Number.isInteger(s.shareCents))).toBe(true);
  });

  it('is deterministic on a tie: the same inputs always land the rounding dust on the same teacher', () => {
    const consumption: ConsumptionRow[] = [
      { teacherUserId: 'zeta', completions: 1 },
      { teacherUserId: 'alpha', completions: 1 },
      { teacherUserId: 'mu', completions: 1 },
    ];
    const run1 = computePlatformPassSplit({ ownPoolCents: 10, carryInCents: 0, consumption });
    const run2 = computePlatformPassSplit({ ownPoolCents: 10, carryInCents: 0, consumption });
    expect(run1).toEqual(run2);
    // 10 / 3 = 3.33 each, all tied remainders → alphabetical tie-break gets the bonus cent.
    const byId = Object.fromEntries(run1.shares.map((s) => [s.teacherUserId, s.shareCents]));
    expect(byId.alpha).toBe(4);
    expect(byId.mu).toBe(3);
    expect(byId.zeta).toBe(3);
  });

  it('re-running the SAME period inputs is idempotent at the math level (same result every time)', () => {
    const input = {
      ownPoolCents: 12345,
      carryInCents: 678,
      consumption: [
        { teacherUserId: 'a', completions: 5 },
        { teacherUserId: 'b', completions: 9 },
      ],
    };
    expect(computePlatformPassSplit(input)).toEqual(computePlatformPassSplit(input));
  });
});
