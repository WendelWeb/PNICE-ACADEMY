/**
 * lib/teacher/platform-pass-payout.ts — DB orchestration for the "Pass
 * PNICE" pro-rata payout split (see lib/teacher/platform-pass-split.ts for
 * the pure math this wraps, and lib/teacher/earnings.ts's file header for
 * the SEAM this closes: a `subscriptions.kind = 'platform'` sale is never
 * attributed to a single teacher at sale time).
 *
 * DIVISION OF LABOUR (mirrors lib/teacher/earnings.ts / lib/teacher/payouts.ts):
 * this file does the DB reads, calls the pure split math, and persists the
 * result. Callers are app/api/cron/platform-pass-split/route.ts (the monthly
 * cron) and lib/teacher/platform-pass-actions.ts (the admin's manual
 * "lancer la répartition" button, /admin/repartition).
 *
 * PERSISTENCE (db/migrations/0016):
 *  - `platform_pass_periods` — one row per period, the pool accounting.
 *    UNIQUE(period) — re-running an already-computed period returns the
 *    PERSISTED result unchanged: never recomputes, never double-carries into
 *    the period after it. A period whose pool (own share + carry-in) is
 *    <= 0 gets NO row at all — "a period with an empty pool is a no-op"
 *    (the task spec, verbatim) — so it's always safe to re-check.
 *  - `platform_pass_splits` — one row per (teacher, period), the UNIQUE
 *    CONSTRAINT the task specifically asked for. `.onConflictDoNothing()`
 *    against it, mirroring `recordSaleEarning`'s sale-per-payment guard.
 *  - `earnings_ledger` — a 'platform_pass' row per split, so the credited
 *    amount lands in the SAME balance the payout queue/threshold reads
 *    (`SUM(net_cents)`, lib/teacher/profile.ts's `getTeacherBalanceCents`).
 *    Guarded by its OWN partial unique index
 *    (`earnings_ledger_platform_pass_split_uniq`), belt-and-suspenders
 *    alongside the splits table's own uniqueness — same two-layer
 *    idempotency `markWithdrawalPaid` uses for its ledger write.
 *
 * NO CROSS-TABLE TRANSACTION: the neon-http driver this codebase uses
 * (db/index.ts) doesn't support interactive transactions — same constraint
 * `lib/payments/fulfill.ts` and `lib/teacher/payouts.ts` already work under.
 * Each insert is independently idempotent instead, so a crash mid-run just
 * leaves the remaining rows for the next re-run to finish — never a
 * double-credit.
 *
 * NEVER THROWS: every exported function is gated (`dbConfigured()`) and
 * wrapped in try/catch, mirroring every other money-critical reader/writer
 * in this codebase — the cron route and the admin action both treat a
 * failure as a clean `{ ok: false }`, never a 500 that could get retried
 * into a double-run.
 */
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { getCommissionPct } from './profile';
import { splitEarnings } from './earnings';
import { planOwnerMap, type SubscriptionGrant } from '@/lib/learner/access';
import {
  computePlatformPassSplit,
  isPlatformPassCompletion,
  monthPeriodRangeUtc,
  type ConsumptionRow,
  type SplitResult,
} from './platform-pass-split';
import type { AdminActor } from '@/lib/admin/data/types';
import { recordAudit } from '@/lib/admin/data/real/users';

const T = schema;

export type PlatformPassTeacherShareView = {
  teacherUserId: string;
  teacherName: string | null;
  teacherEmail: string;
  completions: number;
  shareCents: number;
};

export type PlatformPassPeriodView = {
  period: string;
  /** true = persisted (already run, immutable); false = a live, read-only preview of what a run would do right now. */
  computed: boolean;
  grossCents: number;
  commissionPct: number;
  ownPoolCents: number;
  carryInCents: number;
  totalPoolCents: number;
  consumptionTotal: number;
  distributedCents: number;
  carryOutCents: number;
  computedBy: string | null;
  computedAt: string | null;
  shares: PlatformPassTeacherShareView[];
};

function emptyView(period: string): PlatformPassPeriodView {
  return {
    period,
    computed: false,
    grossCents: 0,
    commissionPct: 0,
    ownPoolCents: 0,
    carryInCents: 0,
    totalPoolCents: 0,
    consumptionTotal: 0,
    distributedCents: 0,
    carryOutCents: 0,
    computedBy: null,
    computedAt: null,
    shares: [],
  };
}

/* ------------------------------- DB reads --------------------------------- */

/** Sum of platform-pass subscription payments settled (status='completed') within `[start, end)`. */
async function getGrossPlatformPassCents(start: Date, end: Date): Promise<number> {
  const rows = await db
    .select({ amountCents: T.payments.amountCents })
    .from(T.payments)
    .innerJoin(T.subscriptions, eq(T.payments.relatedSubscriptionId, T.subscriptions.id))
    .where(
      and(
        eq(T.payments.productType, 'subscription'),
        eq(T.payments.status, 'completed'),
        eq(T.subscriptions.kind, 'platform'),
        gte(T.payments.createdAt, start),
        lt(T.payments.createdAt, end),
      ),
    );
  return rows.reduce((s, r) => s + r.amountCents, 0);
}

/** The most recent EARLIER computed period's `carryOutCents`, or 0 if none exists. Text `period` sorts lexicographically the same as chronologically for `'YYYY-MM'`, so a plain `<`/`ORDER BY` works. Skips over any truly-empty (unpersisted) months in between — see file header. */
async function getCarryInCents(period: string): Promise<number> {
  const [prior] = await db
    .select({ carryOutCents: T.platformPassPeriods.carryOutCents })
    .from(T.platformPassPeriods)
    .where(lt(T.platformPassPeriods.period, period))
    .orderBy(desc(T.platformPassPeriods.period))
    .limit(1);
  return prior?.carryOutCents ?? 0;
}

/**
 * Every qualifying platform-pass lesson completion within `[start, end)`,
 * grouped by `courses.owner_user_id` — the DB-side half of the "which
 * completions count" rule (the pure half is
 * `isPlatformPassCompletion`/`subscriptionsGrantCourse`).
 *
 * "At that time" is approximated from columns the schema actually has: a
 * subscription is treated as covering a completion when
 * `subscriptions.created_at <= completedAt` AND (`current_period_end` is
 * null OR `completedAt <= current_period_end`) — the paid-through boundary
 * as of the LAST renewal, regardless of the subscription's CURRENT status
 * (which reflects "now", not "back then"). An enrollment is treated as
 * covering a completion when `enrollments.purchased_at <= completedAt`,
 * regardless of its current status — a per-course purchase is "already paid
 * for" for good, per the task spec.
 */
async function getQualifyingConsumption(start: Date, end: Date): Promise<ConsumptionRow[]> {
  const progressRows = await db
    .select({ userId: T.progress.userId, courseSlug: T.progress.courseSlug, completedAt: T.progress.completedAt })
    .from(T.progress)
    .where(and(isNotNull(T.progress.completedAt), gte(T.progress.completedAt, start), lt(T.progress.completedAt, end)));

  if (progressRows.length === 0) return [];

  const userIds = [...new Set(progressRows.map((r) => r.userId))];
  const slugs = [...new Set(progressRows.map((r) => r.courseSlug))];

  const [courseRows, enrollRows, subRows] = await Promise.all([
    db.select({ slug: T.courses.slug, ownerUserId: T.courses.ownerUserId }).from(T.courses).where(inArray(T.courses.slug, slugs)),
    db
      .select({ userId: T.enrollments.userId, courseSlug: T.enrollments.courseSlug, purchasedAt: T.enrollments.purchasedAt })
      .from(T.enrollments)
      .where(inArray(T.enrollments.userId, userIds)),
    db
      .select({
        userId: T.subscriptions.userId,
        kind: T.subscriptions.kind,
        teacherPlanId: T.subscriptions.teacherPlanId,
        createdAt: T.subscriptions.createdAt,
        currentPeriodEnd: T.subscriptions.currentPeriodEnd,
      })
      .from(T.subscriptions)
      .where(inArray(T.subscriptions.userId, userIds)),
  ]);

  const ownerBySlug = new Map(courseRows.map((c) => [c.slug, c.ownerUserId]));

  const earliestEnrollByUserCourse = new Map<string, Date>();
  for (const e of enrollRows) {
    const key = `${e.userId}::${e.courseSlug}`;
    const existing = earliestEnrollByUserCourse.get(key);
    if (!existing || e.purchasedAt < existing) earliestEnrollByUserCourse.set(key, e.purchasedAt);
  }

  const subsByUser = new Map<string, typeof subRows>();
  for (const s of subRows) subsByUser.set(s.userId, [...(subsByUser.get(s.userId) ?? []), s]);

  const teacherPlanIds = [...new Set(subRows.map((s) => s.teacherPlanId).filter((id): id is string => Boolean(id)))];
  const planOwners = await planOwnerMap(teacherPlanIds);

  const consumptionMap = new Map<string, number>();
  for (const p of progressRows) {
    const completedAt = p.completedAt;
    if (!completedAt) continue; // defensive; already filtered by isNotNull above
    const ownerUserId = ownerBySlug.get(p.courseSlug) ?? null;
    if (!ownerUserId) continue; // no teacher to attribute (legacy/unowned course)

    const enrolledAt = earliestEnrollByUserCourse.get(`${p.userId}::${p.courseSlug}`);
    const hasEnrollment = Boolean(enrolledAt && enrolledAt <= completedAt);

    const subsAtTime: SubscriptionGrant[] = (subsByUser.get(p.userId) ?? [])
      .filter((s) => s.createdAt <= completedAt && (!s.currentPeriodEnd || completedAt <= s.currentPeriodEnd))
      .map((s) => ({ kind: s.kind, teacherPlanId: s.teacherPlanId }));

    if (isPlatformPassCompletion(hasEnrollment, subsAtTime, ownerUserId, planOwners)) {
      consumptionMap.set(ownerUserId, (consumptionMap.get(ownerUserId) ?? 0) + 1);
    }
  }

  return [...consumptionMap.entries()].map(([teacherUserId, completions]) => ({ teacherUserId, completions }));
}

async function resolveTeacherNames(userIds: string[]): Promise<Map<string, { name: string | null; email: string }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.select({ id: T.users.id, name: T.users.name, email: T.users.email }).from(T.users).where(inArray(T.users.id, userIds));
  return new Map(rows.map((r) => [r.id, { name: r.name ?? null, email: r.email }]));
}

/** The read + pure-compute half, with NO writes — shared by the live preview and the actual run. */
async function aggregatePeriod(period: string): Promise<{
  grossCents: number;
  commissionPct: number;
  ownPoolCents: number;
  carryInCents: number;
  split: SplitResult;
}> {
  const { start, end } = monthPeriodRangeUtc(period);
  const [grossCents, commissionPct, carryInCents, consumption] = await Promise.all([
    getGrossPlatformPassCents(start, end),
    getCommissionPct(),
    getCarryInCents(period),
    getQualifyingConsumption(start, end),
  ]);
  const { netCents: ownPoolCents } = splitEarnings(grossCents, commissionPct);
  const split = computePlatformPassSplit({ ownPoolCents, carryInCents, consumption });
  return { grossCents, commissionPct, ownPoolCents, carryInCents, split };
}

function mapPeriodRow(
  row: typeof T.platformPassPeriods.$inferSelect,
  shares: PlatformPassTeacherShareView[],
): PlatformPassPeriodView {
  return {
    period: row.period,
    computed: true,
    grossCents: row.grossCents,
    commissionPct: row.commissionPctApplied,
    ownPoolCents: row.ownPoolCents,
    carryInCents: row.carryInCents,
    totalPoolCents: row.totalPoolCents,
    consumptionTotal: row.consumptionTotal,
    distributedCents: row.distributedCents,
    carryOutCents: row.carryOutCents,
    computedBy: row.computedBy ?? null,
    computedAt: row.createdAt.toISOString(),
    shares: [...shares].sort((a, b) => b.shareCents - a.shareCents),
  };
}

async function readPersistedView(period: string): Promise<PlatformPassPeriodView | null> {
  const [periodRow] = await db.select().from(T.platformPassPeriods).where(eq(T.platformPassPeriods.period, period)).limit(1);
  if (!periodRow) return null;
  const splitRows = await db
    .select({ split: T.platformPassSplits, user: T.users })
    .from(T.platformPassSplits)
    .innerJoin(T.users, eq(T.platformPassSplits.teacherUserId, T.users.id))
    .where(eq(T.platformPassSplits.period, period));
  const shares = splitRows.map(({ split, user }) => ({
    teacherUserId: split.teacherUserId,
    teacherName: user.name ?? null,
    teacherEmail: user.email,
    completions: split.completions,
    shareCents: split.shareCents,
  }));
  return mapPeriodRow(periodRow, shares);
}

/* -------------------------------- reads ------------------------------------ */

/**
 * The admin page's single-period view: the PERSISTED result if `period` was
 * already run, otherwise a live, read-only PREVIEW of what a run would do
 * right now (`computed: false`) — so the owner can see the split before
 * trusting it, exactly as the task asks. GATED + NEVER THROWS: no
 * DATABASE_URL or a failed read ⇒ an all-zero, `computed: false` view.
 */
export async function getPlatformPassPeriodView(period: string): Promise<PlatformPassPeriodView> {
  if (!dbConfigured()) return emptyView(period);
  try {
    const persisted = await readPersistedView(period);
    if (persisted) return persisted;

    const agg = await aggregatePeriod(period);
    const names = await resolveTeacherNames(agg.split.shares.map((s) => s.teacherUserId));
    const shares: PlatformPassTeacherShareView[] = agg.split.shares
      .map((s) => ({
        teacherUserId: s.teacherUserId,
        teacherName: names.get(s.teacherUserId)?.name ?? null,
        teacherEmail: names.get(s.teacherUserId)?.email ?? '',
        completions: s.completions,
        shareCents: s.shareCents,
      }))
      .sort((a, b) => b.shareCents - a.shareCents);

    return {
      period,
      computed: false,
      grossCents: agg.grossCents,
      commissionPct: agg.commissionPct,
      ownPoolCents: agg.ownPoolCents,
      carryInCents: agg.carryInCents,
      totalPoolCents: agg.split.totalPoolCents,
      consumptionTotal: agg.split.shares.reduce((s, r) => s + r.completions, 0),
      distributedCents: agg.split.distributedCents,
      carryOutCents: agg.split.carryOutCents,
      computedBy: null,
      computedAt: null,
      shares,
    };
  } catch (err) {
    console.error(`[teacher/platform-pass-payout] getPlatformPassPeriodView(${period}) failed, falling back to empty:`, err);
    return emptyView(period);
  }
}

/** Every ALREADY-COMPUTED period, most recent first — the admin page's history list. GATED + FALLBACK: no DATABASE_URL or a failed read ⇒ `[]`, never throws. */
export async function listPlatformPassPeriods(): Promise<PlatformPassPeriodView[]> {
  if (!dbConfigured()) return [];
  try {
    const periods = await db.select().from(T.platformPassPeriods).orderBy(desc(T.platformPassPeriods.period));
    if (periods.length === 0) return [];

    const splitRows = await db
      .select({ split: T.platformPassSplits, user: T.users })
      .from(T.platformPassSplits)
      .innerJoin(T.users, eq(T.platformPassSplits.teacherUserId, T.users.id))
      .where(
        inArray(
          T.platformPassSplits.period,
          periods.map((p) => p.period),
        ),
      );
    const sharesByPeriod = new Map<string, PlatformPassTeacherShareView[]>();
    for (const { split, user } of splitRows) {
      const arr = sharesByPeriod.get(split.period) ?? [];
      arr.push({ teacherUserId: split.teacherUserId, teacherName: user.name ?? null, teacherEmail: user.email, completions: split.completions, shareCents: split.shareCents });
      sharesByPeriod.set(split.period, arr);
    }
    return periods.map((row) => mapPeriodRow(row, sharesByPeriod.get(row.period) ?? []));
  } catch (err) {
    console.error('[teacher/platform-pass-payout] listPlatformPassPeriods failed, falling back to []:', err);
    return [];
  }
}

/* ------------------------------- mutation ---------------------------------- */

export type RunPlatformPassSplitResult = { ok: boolean; message?: string; view: PlatformPassPeriodView };

/**
 * Computes and PERSISTS one calendar month's platform-pass split — the
 * cron's and the admin action's shared entry point. Idempotent (see file
 * header): an already-computed period returns its PERSISTED result
 * untouched; a genuinely empty pool writes nothing at all.
 *
 * `actor` is `null` for the automated cron run (`computed_by: 'cron'`); an
 * `AdminActor` for a manual "lancer la répartition" click, which also
 * records an audit-log entry — same convention
 * lib/admin/actions.ts's other platform-wide (no single target user)
 * settings changes use (`recordAudit({ userId: actor.id, ... })`).
 */
export async function runPlatformPassSplitForPeriod(period: string, actor: AdminActor | null): Promise<RunPlatformPassSplitResult> {
  if (!dbConfigured()) return { ok: false, message: 'db_required', view: emptyView(period) };
  try {
    const existing = await readPersistedView(period);
    if (existing) return { ok: true, message: 'already_computed', view: existing };

    const agg = await aggregatePeriod(period);
    if (agg.split.totalPoolCents <= 0) {
      return { ok: true, message: 'empty_pool', view: emptyView(period) };
    }

    const consumptionTotal = agg.split.shares.reduce((s, r) => s + r.completions, 0);
    const insertedPeriod = await db
      .insert(T.platformPassPeriods)
      .values({
        period,
        grossCents: agg.grossCents,
        commissionPctApplied: agg.commissionPct,
        ownPoolCents: agg.ownPoolCents,
        carryInCents: agg.carryInCents,
        totalPoolCents: agg.split.totalPoolCents,
        consumptionTotal,
        distributedCents: agg.split.distributedCents,
        carryOutCents: agg.split.carryOutCents,
        computedBy: actor?.name ?? 'cron',
      })
      .onConflictDoNothing({ target: T.platformPassPeriods.period })
      .returning({ id: T.platformPassPeriods.id });

    if (insertedPeriod.length === 0) {
      // Lost a race to a concurrent run (cron + admin button in the same
      // minute, or a doubled request) — the OTHER caller owns this period;
      // return its persisted result instead of recomputing/double-crediting.
      const raced = await readPersistedView(period);
      return { ok: true, message: 'already_computed', view: raced ?? emptyView(period) };
    }

    // Per-teacher rows — sequential (no cross-row transaction on the
    // neon-http driver, see file header) but each independently idempotent,
    // so a crash mid-loop just leaves the remaining teachers for a healing
    // re-run rather than any double-credit.
    for (const share of agg.split.shares) {
      if (share.shareCents <= 0) continue;
      const insertedSplit = await db
        .insert(T.platformPassSplits)
        .values({ period, teacherUserId: share.teacherUserId, completions: share.completions, shareCents: share.shareCents })
        .onConflictDoNothing({ target: [T.platformPassSplits.teacherUserId, T.platformPassSplits.period] })
        .returning({ id: T.platformPassSplits.id });
      if (insertedSplit.length === 0) continue; // already credited by a concurrent run — never write the ledger row twice either

      await db
        .insert(T.earningsLedger)
        .values({
          teacherUserId: share.teacherUserId,
          paymentId: null,
          kind: 'platform_pass',
          grossCents: share.shareCents,
          commissionPctApplied: 0,
          commissionCents: 0,
          netCents: share.shareCents,
          currency: 'USD',
          note: period,
          platformPassSplitId: insertedSplit[0].id,
        })
        .onConflictDoNothing({
          target: T.earningsLedger.platformPassSplitId,
          where: sql`${T.earningsLedger.platformPassSplitId} IS NOT NULL AND ${T.earningsLedger.kind} = 'platform_pass'`,
        });
    }

    const persisted = await readPersistedView(period);
    const view = persisted ?? emptyView(period);

    if (actor) {
      await recordAudit({ action: 'run_platform_pass_split', userId: actor.id, admin: actor, detail: period });
    }

    return { ok: true, view };
  } catch (err) {
    console.error(`[teacher/platform-pass-payout] runPlatformPassSplitForPeriod(${period}) failed:`, err);
    return { ok: false, message: 'error', view: emptyView(period) };
  }
}
