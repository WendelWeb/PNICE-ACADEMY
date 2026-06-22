/**
 * Mock implementation of the AdminDataSource contract.
 * Computes KPIs from the deterministic dataset (./dataset).
 */
import type { AdminDataSource, KpiOverview } from '../types';
import { getMockDataset } from './dataset';

const DAY = 86_400_000;

function sameDay(iso: string, now: number): boolean {
  const d = new Date(iso);
  const n = new Date(now);
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function withinDays(iso: string, days: number, now: number): boolean {
  const t = Date.parse(iso);
  return t <= now && t >= now - days * DAY;
}

function sameMonth(iso: string, now: number): boolean {
  const d = new Date(iso);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

async function getKpiOverview(): Promise<KpiOverview> {
  const { users, payments, subscriptions, enrollments, referenceNow } = getMockDataset();
  const now = Date.parse(referenceNow);

  const succeeded = payments.filter((p) => p.status === 'succeeded');
  const refunded = payments.filter((p) => p.status === 'refunded');

  const activeSubscribers = subscriptions.filter((s) => s.status === 'active').length;
  const canceledSubscribers = subscriptions.filter((s) => s.status === 'canceled').length;

  const totalRevenueCents = succeeded.reduce((s, p) => s + p.amountCents, 0);
  const revenueThisMonthCents = succeeded
    .filter((p) => sameMonth(p.createdAt, now))
    .reduce((s, p) => s + p.amountCents, 0);

  // Paying users = anyone with ≥1 succeeded payment.
  const payingUserIds = new Set(succeeded.map((p) => p.userId));
  const payingUsers = payingUserIds.size;

  // Conversion: visitor counts need a real analytics tool (no visit events in
  // the DB) — mock a plausible funnel where ~8% of visitors create an account.
  const newUsers30d = users.filter((u) => withinDays(u.createdAt, 30, now)).length;
  const visitorsThisMonth = Math.round(newUsers30d / 0.08);
  const conversionVisitorToAccountPct = visitorsThisMonth
    ? (newUsers30d / visitorsThisMonth) * 100
    : 0;
  const conversionAccountToPayingPct = users.length
    ? (payingUsers / users.length) * 100
    : 0;

  // Churn (cumulative): canceled / (active + canceled).
  const churnDenom = activeSubscribers + canceledSubscribers;
  const churnRatePct = churnDenom ? (canceledSubscribers / churnDenom) * 100 : 0;

  // ARPU over all accounts; LTV ≈ revenue-per-paying-user / churn fraction.
  const arpuCents = users.length ? Math.round(totalRevenueCents / users.length) : 0;
  const revenuePerPayingCents = payingUsers ? totalRevenueCents / payingUsers : 0;
  const churnFraction = Math.min(Math.max(churnRatePct / 100, 0.05), 0.95);
  const ltvCents = Math.round(revenuePerPayingCents / churnFraction);

  return {
    currency: 'USD',

    totalUsers: users.length,
    activeSubscribers,
    mrrCents: activeSubscribers * subscriptionAmount(subscriptions),
    totalRevenueCents,
    revenueThisMonthCents,

    newUsersToday: users.filter((u) => sameDay(u.createdAt, now)).length,
    newUsers7d: users.filter((u) => withinDays(u.createdAt, 7, now)).length,
    newUsers30d,
    newEnrollmentsToday: enrollments.filter((e) => sameDay(e.enrolledAt, now)).length,
    newEnrollments7d: enrollments.filter((e) => withinDays(e.enrolledAt, 7, now)).length,
    newEnrollments30d: enrollments.filter((e) => withinDays(e.enrolledAt, 30, now)).length,

    visitorsThisMonth,
    conversionVisitorToAccountPct,
    conversionAccountToPayingPct,
    activeLearners7d: users.filter((u) => u.lastActiveAt && withinDays(u.lastActiveAt, 7, now))
      .length,
    activeLearners30d: users.filter(
      (u) => u.lastActiveAt && withinDays(u.lastActiveAt, 30, now),
    ).length,

    churnRatePct,
    arpuCents,
    ltvCents,
    refundsCount: refunded.length,
    refundsAmountCents: refunded.reduce((s, p) => s + p.amountCents, 0),
  };
}

/** Per-subscription monthly amount (uniform in the mock, but read from data). */
function subscriptionAmount(subs: { amountCents: number }[]): number {
  return subs[0]?.amountCents ?? 0;
}

export const mockDataSource: AdminDataSource = {
  getKpiOverview,
};
