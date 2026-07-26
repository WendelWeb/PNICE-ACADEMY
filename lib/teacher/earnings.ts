/**
 * lib/teacher/earnings.ts — the money-critical, ADDITIVE ledger-write layer
 * for Task C3-T5. `lib/payments/fulfill.ts` calls the two exports below
 * AFTER a payment row is already durably committed (or a refund's status
 * update already durably applied) — this module never touches the payment/
 * enrollment/subscription logic itself, it only records what the platform
 * owes the teacher for that payment.
 *
 * MONEY-CRITICAL, NEVER THROWS: both `recordSaleEarning` and
 * `recordRefundReversal` swallow every failure (a bad course lookup, a query
 * error, whatever) behind a try/catch that logs and returns — the webhook
 * must never 500, and fulfillment must never be reprocessed, because of a
 * ledger hiccup. The payment/enrollment recorded by fulfill.ts before either
 * of these runs is the source of truth; the ledger row is best-effort
 * bookkeeping on top of it.
 *
 * PURE MATH (unit-tested in earnings.test.ts, no DB needed):
 *   - `splitEarnings(grossCents, commissionPct)` is the ONE place a gross
 *     amount is split into (commission, net). `commission_cents =
 *     round(gross * pct / 100)`; `net_cents = gross - commission_cents`.
 *   - `reverseSale(sale)` negates a recorded sale row's amounts into its
 *     refund-reversal counterpart (keeps `commissionPctApplied` — the FROZEN
 *     rate, not an amount — unnegated).
 * The commission percentage is read ONCE per sale (`getCommissionPct()`,
 * `lib/teacher/profile.ts`) and frozen onto the row
 * (`commission_pct_applied`) — a later platform-setting change never
 * rewrites historical rows, and a refund reversal reads that FROZEN value
 * back off the original row rather than re-reading the (possibly since
 * changed) platform setting.
 *
 * IDEMPOTENCY:
 *  - Sale rows: `earnings_ledger_sale_payment_uniq` (db/schema.ts) is a
 *    partial unique index — at most one 'sale' row per `payment_id`. The
 *    insert uses `.onConflictDoNothing()` against it, so a duplicate
 *    delivery (or fulfill.ts's own retry-duplicate paths, which don't even
 *    call this — see that file) is a silent, harmless no-op either way.
 *  - Refund rows: `fulfillChargeRefunded` already short-circuits BEFORE
 *    reaching this code on every redelivery (`payment.status === 'refunded'`
 *    ⇒ returns early) — normal Stripe retries never call
 *    `recordRefundReversal` twice. As a second, belt-and-suspenders layer
 *    against a genuine concurrent delivery racing that status update,
 *    `recordRefundReversal` ALSO checks for an existing 'refund' row for the
 *    payment before inserting.
 *
 * TEACHER RESOLUTION: a course payment's teacher is `courses.owner_user_id`
 * for `payment.courseSlug` (read directly off the `courses` table — NOT via
 * `lib/courses/source.ts`'s `getCourseBySlug`, whose `Course` shape doesn't
 * carry `owner_user_id` at all, only slug-keyed content). A subscription
 * payment's teacher is the single active `teacher_plans` row's owner — the
 * marketplace is uniform (see the plan's "owner = teacher #1; the $79 = his
 * teacher_plan. No special-casing") and today there is exactly ONE active
 * plan (scripts/seed-courses.ts seeds it uniquely per owner), so this reads
 * `status = 'active'` with no further disambiguation. If neither resolves —
 * unknown course, no owner, or no active plan — the ledger row is skipped
 * entirely (logged, never thrown): a payment must never be blocked or
 * retried just because we couldn't figure out who to credit.
 */
import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCommissionPct } from './profile';

const T = schema;

export type EarningsSplit = { commissionCents: number; netCents: number };

/**
 * Pure gross → (commission, net) split — the ONE place this math happens.
 * Exported for unit testing without a DB. `commissionPct` is frozen per-row
 * by the caller (`commission_pct_applied`), never re-derived later.
 */
export function splitEarnings(grossCents: number, commissionPct: number): EarningsSplit {
  const commissionCents = Math.round((grossCents * commissionPct) / 100);
  return { commissionCents, netCents: grossCents - commissionCents };
}

export type SaleAmounts = {
  grossCents: number;
  commissionCents: number;
  netCents: number;
  commissionPctApplied: number;
};

/**
 * Pure: negate a recorded sale's amounts into its refund-reversal
 * counterpart. Exported for unit testing. `commissionPctApplied` is a FROZEN
 * RATE (not an amount) and is carried over unchanged — only the cents
 * amounts flip sign.
 */
export function reverseSale(sale: SaleAmounts): SaleAmounts {
  return {
    grossCents: -sale.grossCents,
    commissionCents: -sale.commissionCents,
    netCents: -sale.netCents,
    commissionPctApplied: sale.commissionPctApplied,
  };
}

export type FulfilledPayment = {
  id: string;
  amountCents: number;
  currency: string;
  productType: 'course' | 'subscription';
  courseSlug: string | null;
};

/**
 * Resolves who gets credited for a payment. GATED against the DB directly
 * (not `lib/courses/source.ts`, whose `Course` type has no `owner_user_id` —
 * see file header): `null` on any lookup miss or query failure, never
 * throws — callers treat `null` as "skip the ledger row".
 */
async function resolveTeacherUserId(p: {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
}): Promise<string | null> {
  try {
    if (p.productType === 'course') {
      if (!p.courseSlug) return null;
      const [row] = await db
        .select({ ownerUserId: T.courses.ownerUserId })
        .from(T.courses)
        .where(eq(T.courses.slug, p.courseSlug))
        .limit(1);
      return row?.ownerUserId ?? null;
    }
    // Subscription: uniform platform plan — see file header. Exactly one
    // active teacher_plans row today; if that ever changes without wiring a
    // real per-plan mapping, this deliberately still resolves to the FIRST
    // active row rather than guessing further.
    const [row] = await db
      .select({ ownerUserId: T.teacherPlans.ownerUserId })
      .from(T.teacherPlans)
      .where(eq(T.teacherPlans.status, 'active'))
      .limit(1);
    return row?.ownerUserId ?? null;
  } catch (err) {
    console.error('[teacher/earnings] resolveTeacherUserId failed, skipping ledger row:', err);
    return null;
  }
}

/**
 * Writes the 'sale' earnings_ledger row for a payment fulfill.ts just
 * durably recorded (course purchase, subscription initial charge, or
 * subscription renewal — all three call this the same way). NEVER THROWS:
 * an unresolved teacher, a query error, or the idempotent conflict are all
 * silently (loudly logged) swallowed — see file header.
 */
export async function recordSaleEarning(payment: FulfilledPayment): Promise<void> {
  try {
    const teacherUserId = await resolveTeacherUserId({
      productType: payment.productType,
      courseSlug: payment.courseSlug,
    });
    if (!teacherUserId) {
      console.warn(
        `[teacher/earnings] no teacher resolved for payment ${payment.id} ` +
          `(${payment.productType}/${payment.courseSlug ?? 'subscription'}) — skipping ledger row`,
      );
      return;
    }
    const commissionPct = await getCommissionPct();
    const { commissionCents, netCents } = splitEarnings(payment.amountCents, commissionPct);
    await db
      .insert(T.earningsLedger)
      .values({
        teacherUserId,
        paymentId: payment.id,
        kind: 'sale',
        grossCents: payment.amountCents,
        commissionPctApplied: commissionPct,
        commissionCents,
        netCents,
        currency: payment.currency,
      })
      .onConflictDoNothing({
        target: T.earningsLedger.paymentId,
        where: sql`${T.earningsLedger.paymentId} IS NOT NULL AND ${T.earningsLedger.kind} = 'sale'`,
      });
  } catch (err) {
    console.error(
      `[teacher/earnings] recordSaleEarning failed for payment ${payment.id} (payment already recorded, ledger row skipped):`,
      err,
    );
  }
}

/**
 * Writes the negative 'refund' earnings_ledger row reversing a payment's
 * ORIGINAL 'sale' row, exactly (see `reverseSale`). NEVER THROWS. Idempotent:
 * bails if a 'refund' row already exists for this payment, or if no 'sale'
 * row exists to reverse (a payment recorded before this task shipped, or a
 * sale whose ledger write itself was skipped/failed — nothing to reverse,
 * so nothing is written, rather than guessing an amount).
 */
export async function recordRefundReversal(payment: { id: string }): Promise<void> {
  try {
    const [existingRefund] = await db
      .select({ id: T.earningsLedger.id })
      .from(T.earningsLedger)
      .where(and(eq(T.earningsLedger.paymentId, payment.id), eq(T.earningsLedger.kind, 'refund')))
      .limit(1);
    if (existingRefund) return;

    const [sale] = await db
      .select()
      .from(T.earningsLedger)
      .where(and(eq(T.earningsLedger.paymentId, payment.id), eq(T.earningsLedger.kind, 'sale')))
      .limit(1);
    if (!sale) {
      console.warn(
        `[teacher/earnings] no sale ledger row for payment ${payment.id} — skipping refund reversal`,
      );
      return;
    }

    const reversed = reverseSale({
      grossCents: sale.grossCents,
      commissionCents: sale.commissionCents,
      netCents: sale.netCents,
      commissionPctApplied: sale.commissionPctApplied,
    });

    await db.insert(T.earningsLedger).values({
      teacherUserId: sale.teacherUserId,
      paymentId: payment.id,
      kind: 'refund',
      grossCents: reversed.grossCents,
      commissionPctApplied: reversed.commissionPctApplied,
      commissionCents: reversed.commissionCents,
      netCents: reversed.netCents,
      currency: sale.currency,
    });
  } catch (err) {
    console.error(
      `[teacher/earnings] recordRefundReversal failed for payment ${payment.id} (refund already processed, ledger row skipped):`,
      err,
    );
  }
}
