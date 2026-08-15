/**
 * lib/payments/moncash-fulfill.ts — grant access after a VERIFIED MonCash payment.
 *
 * WHY IT IS SEPARATE FROM fulfill.ts: that module is shaped around Stripe's
 * event stream (a `StripeAction` union, subscriptions, invoices, refunds).
 * MonCash has exactly one shape — a one-off course purchase that either
 * cleared or didn't — so modelling it as a fake Stripe event would be a lie
 * that future readers would have to untangle. What it does NOT duplicate is
 * the part that matters: enrollment goes through fulfill.ts's own exported
 * `ensureCourseEnrollment`, and the teacher's 70% goes through the same
 * `recordSaleEarning` as every card sale.
 *
 * IDEMPOTENCE IS THE WHOLE POINT. MonCash can reach us twice for one payment:
 * once on the server-to-server notification and once when the buyer's browser
 * lands back on the return URL — and the buyer can refresh that page. Every
 * write below is therefore keyed on `(provider='moncash', providerRef=orderId)`:
 *   - already recorded ⇒ re-run the idempotent enrollment + earning upserts so
 *     a half-finished earlier attempt self-heals, then stop. No second payment
 *     row, no second receipt email, no second ledger entry.
 *   - not recorded ⇒ record it, enroll, ledger, email.
 * There is no cross-row transaction available on the neon-http driver (the
 * same constraint fulfill.ts and payouts.ts already live with), so the order
 * is chosen so the worst interleaving is a *missing* follow-up write that the
 * next delivery heals — never a double grant or a double charge.
 *
 * MONEY IS RECORDED IN USD CENTS — the platform's one accounting unit.
 *
 * This was originally the other way round (gourdes in `amountCents`, currency
 * 'htg') on the reasoning that the record should match the buyer's bank. That
 * was wrong, and it corrupted the books the first time it was used: every
 * admin revenue figure reads `payments.amount_cents` and aggregates it with
 * `sum()` WITHOUT looking at `currency`, so a 264-gourde charge was displayed
 * as "$2.64" and, worse, ADDED to dollar totals. Two currencies in one column
 * is not a display bug, it is a broken ledger.
 *
 * So the row now records what the platform earned, in the unit everything else
 * speaks: `usdCentsEquivalent` — the same figure as the course price, the same
 * figure the teacher ledger books the 70% from. The fact that the buyer paid
 * in gourdes is carried by `provider = 'moncash'`, and the exact gourde amount
 * appears where it matters to the buyer: on MonCash's own confirmation and on
 * the "(~X HTG)" line of the receipt.
 */
import { db, isMissingColumnError } from '@/db';
import { paymentsPre0019 } from '@/db/payments-compat';
import { payments, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ensureCourseEnrollment } from './fulfill';
import { recordSaleEarning } from '@/lib/teacher/earnings';
import { recordPromoRedemption } from './promo-redemption';
import { sendEmail, emailConfigured } from '@/lib/email/resend';
import { buildReceiptHtml } from '@/lib/email/templates';
import { getCourseBySlug } from '@/lib/courses/source';
import { getFxRate } from '@/lib/fx';

type NewMoncashPaymentRow = {
  userId: string;
  provider: HtgRail;
  providerRef: string;
  amountCents: number;
  currency: 'usd';
  amountHtg: number | null;
  status: 'completed';
  productType: 'course';
  courseSlug: string;
};

/**
 * Inserts the `payments` row, tolerating a live DB that still lags migration
 * 0019 (`payments.amount_htg` — db/migrations/0019_moncash_amount_htg.sql).
 * Same idiom as lib/payments/fulfill.ts's `insertSubscriptionRow`
 * (protecting db/migrations/0015's `subscriptions.kind` the same way):
 * MONEY-CRITICAL, unlike a read — this is the platform's only live
 * real-money rail, and without this fallback a missing column would make
 * EVERY MonCash sale fail right here, after the buyer's gourdes already
 * left their wallet, with no payment row / enrollment / earnings ever
 * recorded (the outer try/catch in `fulfillMoncashOrder` would just log and
 * return 'error' — silent data loss, not a visible failure). On a
 * missing-column failure, retries the identical insert without `amountHtg`
 * so the sale still records/grants access/emails a receipt; the exact
 * gourde figure is lost for that one row (the receipt falls back to a
 * live-FX-rate estimate, same as any pre-migration MonCash row) but nothing
 * else is.
 */
async function insertMoncashPayment(values: NewMoncashPaymentRow): Promise<{ id: string }[]> {
  try {
    return await db.insert(payments).values(values).onConflictDoNothing().returning({ id: payments.id });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    console.warn(
      '[moncash/fulfill] payments insert fell back to pre-migration columns (no amount_htg) — run `npm run db:push`.',
    );
    // THE RETRY MUST GO THROUGH THE PRE-0019 TWIN TABLE, not through
    // `payments` with the key dropped: drizzle names every schema column in
    // the INSERT it builds (`…, "amount_htg") values (…, default)`) whether
    // or not the key is present, so the old key-dropping retry re-emitted
    // the very column the live DB lacks and failed identically — after the
    // buyer's money had already moved. See db/payments-compat.ts's
    // `paymentsPre0019` header for the empirical proof.
    const { amountHtg: _amountHtg, ...rest } = values;
    return await db
      .insert(paymentsPre0019)
      .values(rest)
      .onConflictDoNothing()
      .returning({ id: paymentsPre0019.id });
  }
}

/**
 * Which Haitian mobile-money rail the gourdes came through. It lands in
 * `payments.provider`, so it is what tells a refund, a reconciliation and the
 * admin's method breakdown WHICH wallet to look in. Defaults to 'moncash'
 * because that rail predates NatCash and every existing caller means it.
 */
export type HtgRail = 'moncash' | 'natcash';

export type MoncashFulfilInput = {
  /** Defaults to 'moncash' — see `HtgRail`. */
  rail?: HtgRail;
  /** OUR reference — the checkout_sessions row id we passed to MonCash. */
  orderId: string;
  userDbId: string;
  courseSlug: string;
  /** Gourdes actually charged, as MonCash reported them. */
  amountHtg: number;
  /** The USD-cents price this order was created from — used for the 70/30 split. */
  usdCentsEquivalent: number;
  /** MonCash's own transaction id, kept for support/reconciliation. */
  transactionId: string | null;
  promoCode?: string | null;
  locale?: 'ht' | 'fr';
};

/**
 * NEVER THROWS. Returns what happened so callers can log it; neither the
 * notification endpoint nor the buyer's return page should ever 500 because a
 * follow-up write (email, ledger) had a bad day — the money already moved.
 */
export async function fulfillMoncashOrder(
  input: MoncashFulfilInput,
): Promise<'processed' | 'already' | 'error'> {
  // One binding, used by the idempotency lookup, the insert and the race
  // re-read alike — so a NatCash payment can never be deduplicated against a
  // MonCash one that happens to share an order id.
  const rail: HtgRail = input.rail ?? 'moncash';
  try {
    const existing = (
      await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.provider, rail), eq(payments.providerRef, input.orderId)))
        .limit(1)
    )[0];

    if (existing) {
      // Self-heal path: a previous delivery recorded the payment but may have
      // died before enrolling or ledgering. Both upserts below are idempotent,
      // so re-running them is free. Deliberately NO receipt email here — the
      // first delivery already sent it.
      await ensureCourseEnrollment(input.userDbId, 'course', input.courseSlug, existing.id);
      await recordSaleEarning({
        id: existing.id,
        amountCents: input.usdCentsEquivalent,
        currency: 'usd',
        productType: 'course',
        courseSlug: input.courseSlug,
        teacherPlanId: null,
        subscriptionKind: undefined,
      });
      return 'already';
    }

    const inserted = (
      await insertMoncashPayment({
        userId: input.userDbId,
        provider: rail,
        providerRef: input.orderId,
        // USD cents, NOT the gourdes charged — see the file header. Every
        // admin revenue figure sums this column blind to `currency`.
        amountCents: input.usdCentsEquivalent,
        currency: 'usd',
        // The gourdes MonCash actually took, frozen here so the receipt
        // never has to re-derive it from a live FX rate later (a rate the
        // admin can and does change — see the file header's "corrupted the
        // books" story for what trusting a live re-derivation costs). Only
        // stored when the provider actually disclosed a positive amount —
        // `remote.amountHtg` can be null/0 on a delivery that didn't carry
        // it, and 0 is not a real gourde figure to freeze as history.
        amountHtg: input.amountHtg > 0 ? Math.round(input.amountHtg) : null,
        status: 'completed',
        productType: 'course',
        courseSlug: input.courseSlug,
      })
    )[0];

    // A concurrent delivery won the race between our SELECT and this INSERT.
    // Its own call is completing the same work, so re-read and take the heal
    // path rather than inserting a second row.
    if (!inserted) {
      const raced = (
        await db
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.provider, rail), eq(payments.providerRef, input.orderId)))
          .limit(1)
      )[0];
      if (raced) {
        await ensureCourseEnrollment(input.userDbId, 'course', input.courseSlug, raced.id);
        return 'already';
      }
      return 'error';
    }

    await ensureCourseEnrollment(input.userDbId, 'course', input.courseSlug, inserted.id);

    // Teacher's 70% — computed on the USD price, like every card sale, so a
    // teacher's balance is one currency and the FX rate of the day can never
    // change what an old sale was worth to them.
    await recordSaleEarning({
      id: inserted.id,
      amountCents: input.usdCentsEquivalent,
      currency: 'usd',
      productType: 'course',
      courseSlug: input.courseSlug,
      teacherPlanId: null,
      subscriptionKind: undefined,
    });

    if (input.promoCode) {
      await recordPromoRedemption({
        paymentId: inserted.id,
        userDbId: input.userDbId,
        promoCode: input.promoCode,
      });
    }

    await sendMoncashReceipt(input);
    return 'processed';
  } catch (e) {
    console.error('[htg/fulfill] failed:', e instanceof Error ? e.message : e);
    return 'error';
  }
}

/** Receipt email — best effort, never fails the fulfilment. */
async function sendMoncashReceipt(input: MoncashFulfilInput): Promise<void> {
  try {
    if (!emailConfigured()) return;
    const user = (await db.select().from(users).where(eq(users.id, input.userDbId)).limit(1))[0];
    if (!user?.email) return;

    const locale = input.locale ?? 'ht';
    const course = await getCourseBySlug(input.courseSlug);
    const itemName =
      (locale === 'fr' ? course?.title_fr : course?.title_ht) ?? course?.title_ht ?? input.courseSlug;

    // The gourdes MonCash actually took — frozen at sale time, never a live
    // re-derivation (see the file header + db/migrations/0019). Only fall
    // back to a live-rate ESTIMATE on the rare delivery where the provider
    // didn't disclose an amount at all. The builder takes one OR the other,
    // so the two cases are spelled out rather than passed as two optionals.
    const receiptBase = {
      locale,
      name: user.name,
      itemName,
      // The receipt shows the USD figure the rest of the platform speaks, with
      // the "(~X HTG)" line showing exactly what MonCash charged.
      amountCents: input.usdCentsEquivalent,
      dateIso: new Date().toISOString(),
      ref: input.transactionId ?? input.orderId,
    };
    const receipt =
      input.amountHtg > 0
        ? buildReceiptHtml({ ...receiptBase, htgExact: Math.round(input.amountHtg) })
        : buildReceiptHtml({ ...receiptBase, rateHtg: await getFxRate() });
    await sendEmail({
      to: user.email,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
    });
  } catch (e) {
    console.error('[htg/fulfill] receipt email failed (non-fatal):', e instanceof Error ? e.message : e);
  }
}
