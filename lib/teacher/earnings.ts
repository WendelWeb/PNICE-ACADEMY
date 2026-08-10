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
 *  - Refund rows (production hardening pass — now AMOUNT-AWARE, not just
 *    existence-based): `fulfillChargeRefunded` already short-circuits BEFORE
 *    reaching this code once `payments.status` is 'refunded' — normal Stripe
 *    retries of a completed full refund never reach here again. As a second,
 *    belt-and-suspenders layer (and the ONLY layer for a partial refund,
 *    which never flips that status), both `recordRefundReversal` (full) and
 *    `recordPartialRefundReversal` (partial — a Stripe `charge.refunded`
 *    with `refunded: false`) route through the shared `reverseSaleUpTo`:
 *    it sums whatever 'refund' rows already exist for the payment and
 *    writes a new row for only the remainder up to the requested target
 *    (capped at the sale's own `grossCents`). This makes a redelivered
 *    event, a second larger partial, and a full refund arriving after an
 *    earlier partial all reconcile to exactly the right total — never a
 *    double reversal, never an under-reversal.
 *
 * TEACHER RESOLUTION: a course payment's teacher is `courses.owner_user_id`
 * for `payment.courseSlug` (read directly off the `courses` table — NOT via
 * `lib/courses/source.ts`'s `getCourseBySlug`, whose `Course` shape doesn't
 * carry `owner_user_id` at all, only slug-keyed content).
 *
 * A subscription payment's teacher is resolved from `teacherPlanId`
 * (Task: per-teacher subscription checkout) — the SPECIFIC `teacher_plans`
 * row the buyer actually purchased, carried end to end from
 * lib/payments/products.ts through Stripe metadata
 * (lib/payments/stripe.ts) and the webhook payload
 * (lib/payments/stripe-events.ts) to lib/payments/fulfill.ts, which passes
 * it here. LEGACY FALLBACK (pre-migration rows / a plan id that no longer
 * resolves): the single active `teacher_plans` row's owner — this was the
 * ONLY behaviour before this task, correct only while there was ever exactly
 * one active plan platform-wide; kept as a last resort so an old in-flight
 * payment (or a redelivered webhook for one) still resolves to SOMEONE
 * rather than silently dropping the ledger row. If nothing resolves at
 * all — unknown course, no owner, or no active plan anywhere — the ledger
 * row is skipped entirely (logged, never thrown): a payment must never be
 * blocked or retried just because we couldn't figure out who to credit.
 *
 * SEAM for the pro-rata payout split (Task: two subscription products, follow-
 * up task NOT built here): a 'platform' subscription payment (the "Pass
 * PNICE" all-access pass, `subscriptions.kind = 'platform'`) is NEVER
 * attributed to a single teacher — `recordSaleEarning` returns early for one,
 * writing NO `earnings_ledger` row at all. The sale is still fully recorded
 * (the `payments` row fulfill.ts already durably inserted, reachable via
 * `payments.related_subscription_id` → `subscriptions.kind = 'platform'`) —
 * a later batch job reads those payments and splits their 70% pro-rata
 * across active teachers. Do not build that split here.
 */
import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { sendEmail } from '@/lib/email/resend';
import { buildTeacherSaleHtml } from '@/lib/email/templates';
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
  /** The specific `teacher_plans.id` this subscription payment is for
   *  (Task: per-teacher subscription checkout) — see file header's TEACHER
   *  RESOLUTION note. Always `null` for a course payment (ignored either
   *  way — course ownership resolves via `courseSlug`). */
  teacherPlanId: string | null;
  /** 'teacher' | 'platform' — only meaningful when `productType ===
   *  'subscription'` (Task: two subscription products). A 'platform' sale
   *  (the "Pass PNICE" all-access pass) is the SEAM described in the file
   *  header: no ledger row is written for it here. Omit/leave `undefined`
   *  for a course payment — it's ignored either way. */
  subscriptionKind?: 'teacher' | 'platform';
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
  teacherPlanId: string | null;
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
    // Subscription: resolve via the SPECIFIC plan purchased, when known —
    // see file header's TEACHER RESOLUTION note.
    if (p.teacherPlanId) {
      const [row] = await db
        .select({ ownerUserId: T.teacherPlans.ownerUserId })
        .from(T.teacherPlans)
        .where(eq(T.teacherPlans.id, p.teacherPlanId))
        .limit(1);
      if (row?.ownerUserId) return row.ownerUserId;
      // Plan id given but no longer resolves (e.g. a hard-deleted row) —
      // fall through to the legacy guess below rather than giving up.
    }
    // LEGACY FALLBACK — see file header. Only reached for a payment with no
    // teacherPlanId at all (pre-migration row, or the rare no-DB
    // platform-default checkout).
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
    // SEAM for the pro-rata payout split (see file header) — a platform-wide
    // "Pass PNICE" sale is deliberately left unattributed at sale time. No DB
    // read even happens here: the payment row is already durably recorded by
    // fulfill.ts before this is called, so skipping is a pure no-op.
    if (payment.productType === 'subscription' && payment.subscriptionKind === 'platform') {
      return;
    }
    const teacherUserId = await resolveTeacherUserId({
      productType: payment.productType,
      courseSlug: payment.courseSlug,
      teacherPlanId: payment.teacherPlanId,
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
    const insertedSale = await db
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
      })
      .returning({ id: T.earningsLedger.id });

    // Stage 6, ADDITIVE — sale notification to the teacher, strictly AFTER
    // the ledger write and ONLY when THIS call actually inserted the row
    // (`returning` non-empty). A duplicate delivery, or a fulfill.ts
    // retry-heal path that found the row already ledgered, conflicts into a
    // no-op above and never re-notifies. Own try/catch: an email hiccup can
    // never be mistaken for (or interfere with) a ledger failure.
    if (insertedSale.length > 0) {
      await sendTeacherSaleEmail({
        teacherUserId,
        productType: payment.productType,
        courseSlug: payment.courseSlug,
        netCents,
        commissionPct,
      });
    }
  } catch (err) {
    console.error(
      `[teacher/earnings] recordSaleEarning failed for payment ${payment.id} (payment already recorded, ledger row skipped):`,
      err,
    );
  }
}

/**
 * Stage 6 — 'Ou fè yon vant' email to the credited teacher, called ONLY when
 * `recordSaleEarning` actually inserted a fresh 'sale' row (never on the
 * idempotent-conflict/heal paths). The teacher's address comes from the
 * `users` table (`teacherUserId` IS `users.id` — the same resolution
 * lib/teacher/payouts.ts and platform-pass-payout.ts already use). NEVER
 * THROWS — a lookup/build/send failure is logged and swallowed; the ledger
 * row this notifies about is already durably written.
 */
async function sendTeacherSaleEmail(p: {
  teacherUserId: string;
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  netCents: number;
  commissionPct: number;
}): Promise<void> {
  try {
    const [teacher] = await db
      .select({ email: T.users.email, name: T.users.name, localePref: T.users.localePref })
      .from(T.users)
      .where(eq(T.users.id, p.teacherUserId))
      .limit(1);
    if (!teacher?.email) return;
    const locale: 'fr' | 'ht' = teacher.localePref === 'fr' ? 'fr' : 'ht';

    let itemName: string;
    if (p.productType === 'course' && p.courseSlug) {
      const [course] = await db
        .select({ titleHt: T.courses.titleHt, titleFr: T.courses.titleFr })
        .from(T.courses)
        .where(eq(T.courses.slug, p.courseSlug))
        .limit(1);
      itemName = (locale === 'fr' ? course?.titleFr : course?.titleHt) || p.courseSlug;
    } else {
      itemName = locale === 'fr' ? 'Abonnement mensuel' : 'Abònman chak mwa';
    }

    const email = buildTeacherSaleHtml({
      locale,
      name: teacher.name,
      itemName,
      netCents: p.netCents,
      netPct: 100 - p.commissionPct,
    });
    await sendEmail({ to: teacher.email, subject: email.subject, html: email.html, text: email.text });
  } catch (err) {
    console.error(
      `[teacher/earnings] sale notification email failed for teacher ${p.teacherUserId} (ledger row already recorded):`,
      err,
    );
  }
}

/**
 * Shared engine behind `recordRefundReversal` (full) and
 * `recordPartialRefundReversal` (production hardening pass — partial Stripe
 * refunds). AMOUNT-AWARE idempotency, not existence-based: sums whatever
 * 'refund' rows already exist for this payment and writes a NEW row for only
 * the remainder up to `targetCents` (capped at the sale's own `grossCents` —
 * Stripe's numbers are trusted, but never trusted to reverse MORE than was
 * actually charged). This is what makes a partial refund followed later by a
 * second (possibly completing) refund correct: the second call's delta is
 * whatever hasn't been reversed yet, never the whole amount again, and a
 * pure redelivery of the same cumulative total is a true no-op (delta ⇐ 0).
 *
 * For a single full refund (the ONLY case that existed before this pass,
 * `recordRefundReversal` below still calls this with an unbounded target)
 * this reproduces the exact prior output: `splitEarnings(grossCents, pct)`
 * is the SAME computation `recordSaleEarning` used to derive the original
 * sale row's `commissionCents`/`netCents` in the first place, so reversing
 * 100% of `grossCents` recomputes those exact numbers, just negated.
 *
 * Returns the cents actually reversed by THIS call (0 ⇒ nothing new to do).
 */
async function reverseSaleUpTo(paymentId: string, targetCents: number): Promise<number> {
  const [sale] = await db
    .select()
    .from(T.earningsLedger)
    .where(and(eq(T.earningsLedger.paymentId, paymentId), eq(T.earningsLedger.kind, 'sale')))
    .limit(1);
  if (!sale) {
    console.warn(
      `[teacher/earnings] no sale ledger row for payment ${paymentId} — skipping refund reversal`,
    );
    return 0;
  }

  const existingRefunds = await db
    .select({ grossCents: T.earningsLedger.grossCents })
    .from(T.earningsLedger)
    .where(and(eq(T.earningsLedger.paymentId, paymentId), eq(T.earningsLedger.kind, 'refund')));
  const alreadyReversedCents = existingRefunds.reduce((sum, r) => sum + Math.abs(r.grossCents), 0);

  const cappedTargetCents = Math.min(Math.max(targetCents, 0), sale.grossCents);
  const deltaCents = cappedTargetCents - alreadyReversedCents;
  if (deltaCents <= 0) return 0; // already fully covered by prior reversal row(s) — pure redelivery/no-op

  const split = splitEarnings(deltaCents, sale.commissionPctApplied);
  await db.insert(T.earningsLedger).values({
    teacherUserId: sale.teacherUserId,
    paymentId,
    kind: 'refund',
    grossCents: -deltaCents,
    commissionPctApplied: sale.commissionPctApplied,
    commissionCents: -split.commissionCents,
    netCents: -split.netCents,
    currency: sale.currency,
  });
  return deltaCents;
}

/**
 * Writes the negative 'refund' earnings_ledger row(s) reversing a payment's
 * ORIGINAL 'sale' row IN FULL. NEVER THROWS. Idempotent (amount-aware — see
 * `reverseSaleUpTo`): a redelivery, or a call that lands after
 * `recordPartialRefundReversal` already reversed part of the same payment,
 * writes only whatever remainder is left, never double-reverses. No-ops if
 * no 'sale' row exists to reverse (a payment recorded before this task
 * shipped, or a sale whose ledger write itself was skipped/failed — nothing
 * to reverse, so nothing is written, rather than guessing an amount).
 */
export async function recordRefundReversal(payment: { id: string }): Promise<void> {
  try {
    await reverseSaleUpTo(payment.id, Number.MAX_SAFE_INTEGER);
  } catch (err) {
    console.error(
      `[teacher/earnings] recordRefundReversal failed for payment ${payment.id} (refund already processed, ledger row skipped):`,
      err,
    );
  }
}

/**
 * Production hardening pass — a Stripe PARTIAL refund (charge.refunded with
 * `refunded: false`) must reverse only the fraction actually refunded, not
 * the teacher's entire sale. `amountRefundedCents` is Stripe's own
 * CUMULATIVE total-refunded-so-far on the charge (not a delta), so this
 * hands straight off to the same amount-aware engine `recordRefundReversal`
 * uses — see `reverseSaleUpTo`'s header for exactly why that makes both a
 * redelivery AND a later second (possibly completing) refund correct.
 *
 * NEVER THROWS. Returns the cents actually newly reversed by THIS call — the
 * caller (fulfill.ts) uses `> 0` to decide whether this delivery is new
 * enough to warrant a fresh notification/email, vs. a pure redelivery.
 */
export async function recordPartialRefundReversal(
  payment: { id: string },
  amountRefundedCents: number,
): Promise<number> {
  try {
    return await reverseSaleUpTo(payment.id, amountRefundedCents);
  } catch (err) {
    console.error(
      `[teacher/earnings] recordPartialRefundReversal failed for payment ${payment.id}:`,
      err,
    );
    return 0;
  }
}
