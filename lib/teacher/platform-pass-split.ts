/**
 * lib/teacher/platform-pass-split.ts — PURE math for the "Pass PNICE"
 * (platform-wide all-access subscription) pro-rata payout split. Follow-up
 * to lib/teacher/earnings.ts's SEAM (see that file's header): a
 * `subscriptions.kind = 'platform'` sale is NEVER attributed to a single
 * teacher at sale time — the 70% pool it generates each calendar month is
 * instead divided, once the month closes, among every teacher whose courses
 * a platform-pass holder actually completed lessons in that month.
 *
 * PURE, NO DB (mirrors lib/courses/readiness-anchors.ts exactly): every
 * export here is a plain function over plain data, unit-tested in
 * platform-pass-split.test.ts without touching Postgres. The DB aggregation
 * that feeds this (which payments/progress/subscriptions rows exist) lives
 * in lib/teacher/platform-pass-payout.ts, which imports this module.
 *
 * THE RULE (binding, from the task spec):
 *  - pool = 70% of platform-pass payments settled in the calendar month —
 *    the SAME commission split as every other sale (reuse
 *    lib/teacher/earnings.ts's `splitEarnings`; this file never redefines
 *    70/30).
 *  - divided among teachers in proportion to LESSON COMPLETIONS
 *    (`progress.completedAt` in the month) that were only possible BECAUSE
 *    of the platform pass — see `isPlatformPassCompletion` below, which
 *    reuses lib/learner/access.ts's `subscriptionsGrantCourse` (the ONE
 *    place "which pass covers which course" is decided) instead of
 *    restating that rule.
 *  - CARRY-FORWARD: a month with money but zero qualifying consumption must
 *    not drop it — the whole amount rolls into the next period's pool. A
 *    month with literally nothing (no payments settled, no carry-in either)
 *    is a no-op.
 *  - EXACT SUM: the per-teacher cents always add up to EXACTLY the pool —
 *    largest-remainder placement of the rounding dust, never a stray cent
 *    lost or invented.
 */
import { subscriptionsGrantCourse, type SubscriptionGrant } from '@/lib/learner/access';

export type MonthPeriod = string; // 'YYYY-MM', a UTC calendar month.

/** UTC `[start, end)` boundaries of a `'YYYY-MM'` period. Throws on a malformed period — every caller (this module's own helpers, the cron, the admin action) controls the format itself; this never sees raw user input. */
export function monthPeriodRangeUtc(period: MonthPeriod): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`invalid period: ${period}`);
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (month < 1 || month > 12) throw new Error(`invalid period: ${period}`);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

/** The `'YYYY-MM'` period a UTC instant falls in. */
export function monthPeriodOf(date: Date): MonthPeriod {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The period immediately before `period` (`'2026-01'` → `'2025-12'`). Used by the cron to target "last full calendar month" relative to when it runs. */
export function previousMonthPeriod(period: MonthPeriod): MonthPeriod {
  const { start } = monthPeriodRangeUtc(period);
  return monthPeriodOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)));
}

/**
 * Pure: does this lesson completion actually belong to the platform-pass
 * pool, or is it already paid for another way?
 *
 * `hasEnrollment` is the caller's own (userId, courseSlug) lookup — a
 * per-course purchase always wins, regardless of any subscription.
 * `subsAtCompletionTime` is every subscription grant the caller has
 * determined was active WHEN the lesson was completed (not "is active now")
 * — see lib/teacher/platform-pass-payout.ts for how that's approximated from
 * `subscriptions.createdAt`/`current_period_end`.
 *
 * Reuses lib/learner/access.ts's `subscriptionsGrantCourse` for the "does a
 * TEACHER pass alone cover this course" question — filtering to teacher-kind
 * subs only and asking the SAME question access.ts asks, rather than
 * re-deriving the access rule here. A completion covered by a teacher pass
 * is excluded (already paid for via that pass) even if the learner ALSO
 * holds a platform pass at the same time — the teacher-pass purchase is the
 * more specific, already-attributed revenue.
 */
export function isPlatformPassCompletion(
  hasEnrollment: boolean,
  subsAtCompletionTime: SubscriptionGrant[],
  courseOwnerUserId: string | null,
  planOwnerByPlanId: Map<string, string>,
): boolean {
  if (hasEnrollment) return false;
  const teacherSubsOnly = subsAtCompletionTime.filter((s) => s.kind === 'teacher');
  if (subscriptionsGrantCourse(teacherSubsOnly, courseOwnerUserId, planOwnerByPlanId)) return false;
  return subsAtCompletionTime.some((s) => s.kind === 'platform');
}

export type ConsumptionRow = { teacherUserId: string; completions: number };
export type TeacherShare = { teacherUserId: string; completions: number; shareCents: number };

export type SplitInput = {
  /** This month's own 70% pool (already commission-split — see file header). */
  ownPoolCents: number;
  /** Carried forward from the most recent earlier period with zero qualifying consumption. */
  carryInCents: number;
  /** Qualifying platform-pass completions this month, grouped by `courses.owner_user_id`. */
  consumption: ConsumptionRow[];
};

export type SplitResult = {
  totalPoolCents: number;
  distributedCents: number;
  carryOutCents: number;
  shares: TeacherShare[];
};

/**
 * THE pro-rata split math — largest-remainder method, so
 * `sum(shares[].shareCents) + carryOutCents === totalPoolCents` EXACTLY,
 * always (unit-tested against awkward numbers, e.g. a 10001¢ pool over 3
 * teachers).
 *
 *  - `totalPoolCents <= 0`              → no-op: nothing to distribute or carry.
 *  - `totalPoolCents > 0`, no consumption  → carries the WHOLE pool forward.
 *  - `totalPoolCents > 0`, has consumption → distributes the WHOLE pool now.
 */
export function computePlatformPassSplit(input: SplitInput): SplitResult {
  const totalPoolCents = input.ownPoolCents + input.carryInCents;
  const totalCompletions = input.consumption.reduce((s, c) => s + c.completions, 0);

  if (totalPoolCents <= 0) {
    return { totalPoolCents: Math.max(totalPoolCents, 0), distributedCents: 0, carryOutCents: 0, shares: [] };
  }
  if (totalCompletions <= 0) {
    return { totalPoolCents, distributedCents: 0, carryOutCents: totalPoolCents, shares: [] };
  }

  // Largest-remainder method: floor each teacher's exact proportional share,
  // then hand out the leftover cents (always fewer than there are rows) one
  // at a time to the rows with the biggest fractional remainder —
  // deterministic tie-break by teacherUserId so re-running the SAME inputs
  // always lands the rounding dust identically.
  const floored = input.consumption.map((c) => {
    const exact = (totalPoolCents * c.completions) / totalCompletions;
    const floor = Math.floor(exact);
    return { teacherUserId: c.teacherUserId, completions: c.completions, floor, remainder: exact - floor };
  });
  const allocated = floored.reduce((s, f) => s + f.floor, 0);
  const dust = totalPoolCents - allocated;

  const byRemainderDesc = [...floored].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.teacherUserId.localeCompare(b.teacherUserId);
  });
  const bonusRecipients = new Set(byRemainderDesc.slice(0, dust).map((f) => f.teacherUserId));

  const shares: TeacherShare[] = floored.map((f) => ({
    teacherUserId: f.teacherUserId,
    completions: f.completions,
    shareCents: f.floor + (bonusRecipients.has(f.teacherUserId) ? 1 : 0),
  }));

  const distributedCents = shares.reduce((s, r) => s + r.shareCents, 0);
  return { totalPoolCents, distributedCents, carryOutCents: totalPoolCents - distributedCents, shares };
}
