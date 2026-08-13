/**
 * lib/teacher/reconciliation.ts — /admin/bilan's single reconciliation view:
 * what the platform earned (its commission), what teachers have earned, what
 * has already been paid out, and what is outstanding right now. Read-only,
 * derived entirely from `earnings_ledger` + `withdrawal_requests` +
 * `platform_pass_periods` — no new schema, no new money-path writes. Mirrors
 * lib/teacher/platform-pass-payout.ts's division of labour: a pure
 * aggregation function (unit-tested without a DB) wrapped by a GATED +
 * NEVER-THROWS DB read (same convention as every other reader in this file's
 * neighbourhood — lib/teacher/payouts.ts, platform-pass-payout.ts).
 *
 * MATH:
 *  - Course / teacher-subscription commission: `earnings_ledger.commissionCents`
 *    summed over kind IN ('sale','refund') — a 'refund' row is already the
 *    negative mirror of its 'sale' (lib/teacher/earnings.ts's
 *    `reverseSaleUpTo`), so this sum is automatically net of every refund,
 *    partial or full.
 *  - Pass PNICE commission: the 30% that NEVER enters `earnings_ledger` at
 *    all — a 'platform_pass' row is already net of commission (see
 *    db/schema.ts's `earningsLedger` comment: "the pool it's paid from is
 *    already NET of commission"). Recovered instead as
 *    `grossCents - ownPoolCents` per COMPUTED period (`platform_pass_periods`
 *    rows only — the not-yet-run candidate month shown as a preview on
 *    /admin/repartition is deliberately excluded: nothing to reconcile until
 *    it is actually persisted).
 *  - Per-teacher balance: `SUM(net_cents)` across EVERY kind for that
 *    teacher — the exact invariant `getTeacherBalanceCents` (./profile.ts)
 *    enforces one teacher at a time; recomputed here in one pass over the
 *    whole ledger so the page doesn't fire one query per teacher.
 *  - Paid out: `withdrawal_requests.amountCents` summed where status='paid'.
 *  - Pending: same, where status='pending' (requested, not yet processed —
 *    a subset of "outstanding", shown separately so the owner can see what's
 *    actively queued vs. simply accrued and never requested).
 */
import { inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';

const T = schema;

export type ReconciliationTeacherRow = {
  teacherUserId: string;
  teacherName: string | null;
  teacherEmail: string;
  /** Net of refunds — course + teacher-subscription sales only (excludes Pass PNICE). */
  grossSalesCents: number;
  /** The platform's cut of this teacher's own sales, net of refunds. */
  commissionCents: number;
  /** This teacher's share of Pass PNICE pools ever credited (already net — no further commission). */
  platformPassCents: number;
  /** Total ever credited to this teacher (sale + refund + platform_pass), before any withdrawal. */
  netEarnedCents: number;
  paidOutCents: number;
  pendingWithdrawalCents: number;
  /** Currently owed, un-withdrawn — `SUM(net_cents)` across every ledger kind. */
  balanceCents: number;
};

export type ReconciliationTotals = {
  /** Commission from course + teacher-subscription sales, net of refunds. */
  salesCommissionCents: number;
  /** Commission recovered from computed Pass PNICE periods (the 30% that never enters the ledger). */
  platformPassCommissionCents: number;
  /** What the platform earned overall — the sum of the two above. */
  platformCommissionCents: number;
  /** Total ever credited to teachers (all kinds), before any withdrawal. */
  teacherNetEarnedCents: number;
  paidOutCents: number;
  pendingWithdrawalsCents: number;
  /** Owed right now, un-withdrawn — `teacherNetEarnedCents - paidOutCents`. */
  outstandingCents: number;
};

export type Reconciliation = {
  totals: ReconciliationTotals;
  byTeacher: ReconciliationTeacherRow[];
};

function emptyReconciliation(): Reconciliation {
  return {
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
  };
}

export type LedgerAggInput = {
  teacherUserId: string;
  kind: string;
  grossCents: number;
  commissionCents: number;
  netCents: number;
};
export type WithdrawalAggInput = { teacherUserId: string; status: string; amountCents: number };
export type PassPeriodAggInput = { grossCents: number; ownPoolCents: number };
export type TeacherInfo = { name: string | null; email: string };

/**
 * Pure aggregation over already-loaded rows — exported for unit testing
 * without a DB (same pattern as lib/teacher/earnings.ts's `splitEarnings`/
 * `reverseSale` and lib/teacher/platform-pass-split.ts's `computePlatformPassSplit`).
 * Every teacher who appears in EITHER the ledger or the withdrawal queue gets
 * a row, even one with an all-zero ledger (e.g. a rejected withdrawal only).
 */
export function aggregateReconciliation(
  ledger: LedgerAggInput[],
  withdrawals: WithdrawalAggInput[],
  passPeriods: PassPeriodAggInput[],
  teacherInfo: Map<string, TeacherInfo>,
): Reconciliation {
  const byTeacher = new Map<string, ReconciliationTeacherRow>();
  const rowFor = (id: string): ReconciliationTeacherRow => {
    let row = byTeacher.get(id);
    if (!row) {
      const info = teacherInfo.get(id);
      row = {
        teacherUserId: id,
        teacherName: info?.name ?? null,
        teacherEmail: info?.email ?? '',
        grossSalesCents: 0,
        commissionCents: 0,
        platformPassCents: 0,
        netEarnedCents: 0,
        paidOutCents: 0,
        pendingWithdrawalCents: 0,
        balanceCents: 0,
      };
      byTeacher.set(id, row);
    }
    return row;
  };

  let salesCommissionCents = 0;
  for (const row of ledger) {
    const r = rowFor(row.teacherUserId);
    r.balanceCents += row.netCents;
    if (row.kind === 'sale' || row.kind === 'refund') {
      r.grossSalesCents += row.grossCents;
      r.commissionCents += row.commissionCents;
      r.netEarnedCents += row.netCents;
      salesCommissionCents += row.commissionCents;
    } else if (row.kind === 'platform_pass') {
      r.platformPassCents += row.netCents;
      r.netEarnedCents += row.netCents;
    }
    // 'withdrawal'/'adjustment' rows only move balanceCents (already applied
    // above) — they are not "earned", so they don't touch netEarnedCents.
  }

  let paidOutCents = 0;
  let pendingWithdrawalsCents = 0;
  for (const w of withdrawals) {
    const r = rowFor(w.teacherUserId);
    if (w.status === 'paid') {
      r.paidOutCents += w.amountCents;
      paidOutCents += w.amountCents;
    } else if (w.status === 'pending') {
      r.pendingWithdrawalCents += w.amountCents;
      pendingWithdrawalsCents += w.amountCents;
    }
  }

  const platformPassCommissionCents = passPeriods.reduce((s, p) => s + (p.grossCents - p.ownPoolCents), 0);
  const teacherNetEarnedCents = [...byTeacher.values()].reduce((s, r) => s + r.netEarnedCents, 0);
  const outstandingCents = [...byTeacher.values()].reduce((s, r) => s + r.balanceCents, 0);

  return {
    totals: {
      salesCommissionCents,
      platformPassCommissionCents,
      platformCommissionCents: salesCommissionCents + platformPassCommissionCents,
      teacherNetEarnedCents,
      paidOutCents,
      pendingWithdrawalsCents,
      outstandingCents,
    },
    byTeacher: [...byTeacher.values()].sort((a, b) => b.balanceCents - a.balanceCents),
  };
}

/**
 * The `/admin/bilan` page's one read. GATED + NEVER THROWS: no
 * `DATABASE_URL` or a failed read ⇒ an all-zero, empty view — same contract
 * every other admin money reader in this codebase gives.
 */
export async function getReconciliation(): Promise<Reconciliation> {
  if (!dbConfigured()) return emptyReconciliation();
  try {
    const [ledger, withdrawals, passPeriods] = await Promise.all([
      db
        .select({
          teacherUserId: T.earningsLedger.teacherUserId,
          kind: T.earningsLedger.kind,
          grossCents: T.earningsLedger.grossCents,
          commissionCents: T.earningsLedger.commissionCents,
          netCents: T.earningsLedger.netCents,
        })
        .from(T.earningsLedger),
      db
        .select({
          teacherUserId: T.withdrawalRequests.teacherUserId,
          status: T.withdrawalRequests.status,
          amountCents: T.withdrawalRequests.amountCents,
        })
        .from(T.withdrawalRequests),
      db
        .select({ grossCents: T.platformPassPeriods.grossCents, ownPoolCents: T.platformPassPeriods.ownPoolCents })
        .from(T.platformPassPeriods),
    ]);

    const teacherIds = new Set<string>();
    for (const l of ledger) teacherIds.add(l.teacherUserId);
    for (const w of withdrawals) teacherIds.add(w.teacherUserId);

    const users =
      teacherIds.size === 0
        ? []
        : await db
            .select({ id: T.users.id, name: T.users.name, email: T.users.email })
            .from(T.users)
            .where(inArray(T.users.id, [...teacherIds]));
    const teacherInfo = new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));

    return aggregateReconciliation(ledger, withdrawals, passPeriods, teacherInfo);
  } catch (err) {
    console.error('[teacher/reconciliation] getReconciliation failed, falling back to empty:', err);
    return emptyReconciliation();
  }
}
