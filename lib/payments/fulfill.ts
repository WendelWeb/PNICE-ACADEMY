/**
 * Stripe fulfillment — the ONLY place webhook events touch the DB.
 * Idempotent by payments.provider_ref: Stripe retries events, and
 * checkout.session.completed + invoice.paid can describe the same charge.
 */
import { db, isMissingColumnError } from '@/db';
import {
  payments,
  enrollments,
  subscriptions,
  checkoutSessions,
  adminNotifications,
  users,
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getStripeSubscription } from './stripe';
import { resolveSubscriptionNaming } from './products';
import { sendEmail, emailConfigured } from '@/lib/email/resend';
import {
  buildReceiptHtml,
  buildPaymentFailedHtml,
  buildRefundConfirmationHtml,
} from '@/lib/email/templates';
import { buildReceiptPdf } from '@/lib/pdf/receipt';
import { htgLabelAt } from '@/lib/money';
import { getFxRate } from '@/lib/fx';
import { getCourseBySlug } from '@/lib/courses/source';
import { recordSaleEarning, recordRefundReversal, recordPartialRefundReversal } from '@/lib/teacher/earnings';
import { recordPromoRedemption } from './promo-redemption';
import { mapStripeSubscriptionStatus, type StripeAction } from './stripe-events';

export async function fulfillAction(action: StripeAction): Promise<'processed' | 'ignored'> {
  switch (action.kind) {
    case 'checkout_completed':
      return fulfillCheckoutCompleted(action);
    case 'invoice_paid':
      return fulfillInvoicePaid(action);
    case 'invoice_failed':
      return fulfillInvoiceFailed(action);
    case 'charge_refunded':
      return fulfillChargeRefunded(action);
    case 'subscription_updated':
      return fulfillSubscriptionUpdated(action);
    case 'subscription_deleted':
      return fulfillSubscriptionDeleted(action);
    default:
      return 'ignored';
  }
}

type NewSubscriptionRow = {
  userId: string;
  status: 'active';
  provider: 'stripe';
  providerRef: string;
  currentPeriodEnd: Date | null;
  teacherPlanId: string | null;
  kind: 'teacher' | 'platform';
};

/**
 * Insert a new `subscriptions` row, tolerating a live DB that still lags
 * this task's migration (`subscriptions.kind` — the owner applies it
 * manually with `db:push`, see db/migrations/0015's header). Money-critical:
 * unlike a read (lib/teacher/profile.ts's own migration-lag fix), a webhook
 * that throws here isn't just a bad response — Stripe redelivers it, but
 * until the migration lands every redelivery fails the SAME way, leaving a
 * customer who already paid unable to access what they just bought. On a
 * missing-column failure, retry the identical insert without `kind` so
 * checkout keeps working (grandfathered to the DB column's own eventual
 * 'platform' default) until `db:push` runs.
 */
async function insertSubscriptionRow(
  values: NewSubscriptionRow,
): Promise<{ id: string }[]> {
  try {
    return await db
      .insert(subscriptions)
      .values(values)
      .onConflictDoNothing({ target: subscriptions.providerRef })
      .returning({ id: subscriptions.id });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    console.warn(
      '[fulfill] subscriptions insert fell back to pre-migration columns (no kind) — run `npm run db:push`.',
    );
    const { kind: _kind, ...rest } = values;
    return await db
      .insert(subscriptions)
      .values(rest)
      .onConflictDoNothing({ target: subscriptions.providerRef })
      .returning({ id: subscriptions.id });
  }
}

async function paymentExists(providerRef: string): Promise<boolean> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.provider, 'stripe'), eq(payments.providerRef, providerRef)))
    .limit(1);
  return rows.length > 0;
}

type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * `subscriptions` row by `providerRef`, tolerating a live DB that still lags
 * this task's migration (see `insertSubscriptionRow`'s header for why this
 * matters here specifically). A bare `db.select()` names EVERY schema
 * column, so a missing `kind` column would otherwise fail this read
 * entirely — not just the two-subscription-products feature, but the
 * renewal/failed-payment handling that already worked before this task
 * (`fulfillInvoicePaid`/`fulfillInvoiceFailed` below). Retries with the
 * pre-migration column list and defaults the missing `kind` to 'platform' —
 * the SAME grandfather default the column's own schema default applies once
 * `db:push` runs.
 */
async function selectSubscriptionByProviderRef(providerRef: string): Promise<SubscriptionRow | undefined> {
  try {
    return (
      await db.select().from(subscriptions).where(eq(subscriptions.providerRef, providerRef)).limit(1)
    )[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    console.warn(
      '[fulfill] subscriptions read fell back to pre-migration columns (no kind) — run `npm run db:push`.',
    );
    const row = (
      await db
        .select({
          id: subscriptions.id,
          userId: subscriptions.userId,
          status: subscriptions.status,
          provider: subscriptions.provider,
          providerRef: subscriptions.providerRef,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
          teacherPlanId: subscriptions.teacherPlanId,
          createdAt: subscriptions.createdAt,
          updatedAt: subscriptions.updatedAt,
        })
        .from(subscriptions)
        .where(eq(subscriptions.providerRef, providerRef))
        .limit(1)
    )[0];
    return row ? ({ ...row, kind: 'platform' } as SubscriptionRow) : undefined;
  }
}

async function findPaymentByRef(providerRef: string): Promise<
  | {
      id: string;
      amountCents: number;
      currency: string;
      productType: 'course' | 'subscription';
      courseSlug: string | null;
      relatedSubscriptionId: string | null;
    }
  | undefined
> {
  return (
    await db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        currency: payments.currency,
        productType: payments.productType,
        courseSlug: payments.courseSlug,
        relatedSubscriptionId: payments.relatedSubscriptionId,
      })
      .from(payments)
      .where(and(eq(payments.provider, 'stripe'), eq(payments.providerRef, providerRef)))
      .limit(1)
  )[0];
}

// Idempotent enrollment upsert, shared by the first-delivery path (step 3)
// and every self-heal path (duplicate webhook, concurrent-insert race):
// skip if already enrolled and active, otherwise insert linked to the payment.
async function ensureCourseEnrollment(
  userDbId: string,
  productType: 'course' | 'subscription',
  courseSlug: string | null,
  paymentId: string,
): Promise<void> {
  if (!(productType === 'course' && courseSlug)) return;
  const already = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userDbId),
        eq(enrollments.courseSlug, courseSlug),
        eq(enrollments.status, 'active'),
      ),
    )
    .limit(1);
  if (already.length === 0) {
    await db.insert(enrollments).values({
      userId: userDbId,
      courseSlug,
      status: 'active',
      relatedPaymentId: paymentId,
    });
  }
}

type CheckoutCompleted = Extract<StripeAction, { kind: 'checkout_completed' }>;

async function fulfillCheckoutCompleted(a: CheckoutCompleted): Promise<'processed' | 'ignored'> {
  // Production hardening pass — Stripe explicitly warns against fulfilling
  // purely off checkout.session.completed: for an ASYNCHRONOUS payment
  // method that event can fire while `payment_status` is still 'unpaid'.
  // Every card checkout (the only method this app has ever actually
  // offered) already reports 'paid' here, so this changes nothing for the
  // real flow — it only refuses to grant anything for a genuinely unpaid
  // session. `null` (a payload from before this field existed, or a
  // malformed test event) is treated the SAME as 'unpaid' — safer to wait
  // for a clearer signal than to guess "paid". Nothing is written before
  // this check, so 'ignored' here is a true no-op: Stripe's own
  // `checkout.session.async_payment_succeeded` maps to this identical
  // action kind and re-delivers once the payment actually clears (see
  // lib/payments/stripe-events.ts).
  if (a.paymentStatus !== 'paid' && a.paymentStatus !== 'no_payment_required') {
    return 'ignored';
  }
  if (!a.userDbId) throw new Error('checkout.session.completed without client_reference_id');
  const userDbId = a.userDbId;
  const providerRef = a.paymentIntentId ?? a.sessionId;

  const existingPayment = await findPaymentByRef(providerRef);
  if (existingPayment) {
    // Retry duplicate. A prior delivery may have recorded the payment but
    // failed before the enrollment insert landed — re-run the idempotent
    // enrollment upsert so access self-heals. Do not resend the receipt
    // email or re-insert the sale notification on this path.
    //
    // Additive: also heal a missed earnings-ledger row — if a prior delivery
    // died between the payment insert committing and the ledger insert below,
    // every redelivery would otherwise land here and never record the
    // earning. NEVER THROWS and idempotent (sale-dedup unique index +
    // onConflictDoNothing — see lib/teacher/earnings.ts), so this is a safe
    // no-op once already ledgered.
    await recordSaleEarning({
      id: existingPayment.id,
      amountCents: existingPayment.amountCents,
      currency: existingPayment.currency,
      productType: existingPayment.productType,
      courseSlug: existingPayment.courseSlug,
      // Every redelivery of the SAME event carries the SAME metadata — safe
      // to re-read off `a` rather than joining back through
      // `relatedSubscriptionId` (Task: per-teacher subscription checkout).
      teacherPlanId: a.teacherPlanId,
      subscriptionKind: a.subscriptionKind,
    });
    // Additive (Stage: checkout honesty): same self-heal for a missed promo
    // redemption — NEVER THROWS and idempotent (pre-check + partial unique
    // index, see lib/payments/promo-redemption.ts), no-op once marked.
    if (a.promoCode) {
      await recordPromoRedemption({ paymentId: existingPayment.id, userDbId, promoCode: a.promoCode });
    }
    await ensureCourseEnrollment(userDbId, a.productType, a.courseSlug, existingPayment.id);
    return 'processed';
  }

  const user = (
    await db.select().from(users).where(eq(users.id, userDbId)).limit(1)
  )[0];
  if (!user) throw new Error(`user ${userDbId} not found for checkout ${a.sessionId}`);

  // 1. Subscription row first (payment row links to it).
  let subscriptionRowId: string | null = null;
  if (a.mode === 'subscription' && a.subscriptionId) {
    const subscriptionId = a.subscriptionId;
    const existing = (
      await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.providerRef, subscriptionId))
        .limit(1)
    )[0];
    if (existing) {
      subscriptionRowId = existing.id;
    } else {
      const remote = await getStripeSubscription(subscriptionId);
      const insertedSubscriptions = await insertSubscriptionRow({
        userId: userDbId,
        status: 'active',
        provider: 'stripe',
        providerRef: subscriptionId,
        currentPeriodEnd: remote?.currentPeriodEnd ?? null,
        // Task: per-teacher subscription checkout — recorded once, at
        // creation, so every renewal (fulfillInvoicePaid below) reads it
        // straight off this row instead of re-parsing Stripe metadata.
        teacherPlanId: a.teacherPlanId,
        // Task: two subscription products — same reasoning: recorded once
        // at creation, read straight off this row on every renewal.
        kind: a.subscriptionKind,
      });
      if (insertedSubscriptions.length > 0) {
        subscriptionRowId = insertedSubscriptions[0].id;
      } else {
        // Concurrent delivery won the race — pick up the row it created.
        const raced = (
          await db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(eq(subscriptions.providerRef, subscriptionId))
            .limit(1)
        )[0];
        subscriptionRowId = raced?.id ?? null;
      }
    }
  }

  // 2. Payment row.
  const insertedPayments = await db
    .insert(payments)
    .values({
      userId: userDbId,
      provider: 'stripe',
      providerRef,
      amountCents: a.amountCents,
      currency: a.currency,
      status: 'completed',
      productType: a.productType,
      courseSlug: a.courseSlug,
      relatedSubscriptionId: subscriptionRowId,
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerRef] })
    .returning({ id: payments.id });

  if (insertedPayments.length === 0) {
    // Concurrent delivery won the race and already recorded this payment —
    // heal down the same path as an ordinary retry duplicate, no email/notif.
    const raced = await findPaymentByRef(providerRef);
    if (!raced) throw new Error(`payment ${providerRef} lost after onConflictDoNothing race`);
    // Additive: heal a missed earnings-ledger row for the same reason as the
    // existingPayment branch above — NEVER THROWS and idempotent, no-op once
    // already ledgered.
    await recordSaleEarning({
      id: raced.id,
      amountCents: raced.amountCents,
      currency: raced.currency,
      productType: raced.productType,
      courseSlug: raced.courseSlug,
      teacherPlanId: a.teacherPlanId,
      subscriptionKind: a.subscriptionKind,
    });
    // Additive (Stage: checkout honesty): heal a missed promo redemption on
    // the raced path too — idempotent, never throws.
    if (a.promoCode) {
      await recordPromoRedemption({ paymentId: raced.id, userDbId, promoCode: a.promoCode });
    }
    await ensureCourseEnrollment(userDbId, a.productType, a.courseSlug, raced.id);
    return 'processed';
  }
  const payment = insertedPayments[0];

  // 2b. Additive: record the teacher's earnings-ledger 'sale' row for this
  // payment (course purchase, or subscription initial charge). NEVER THROWS
  // and internally idempotent (see lib/teacher/earnings.ts's file header) —
  // this can never fail or block fulfillment, which is already durably
  // recorded above.
  await recordSaleEarning({
    id: payment.id,
    amountCents: a.amountCents,
    currency: a.currency,
    productType: a.productType,
    courseSlug: a.courseSlug,
    teacherPlanId: a.teacherPlanId,
    subscriptionKind: a.subscriptionKind,
  });

  // 2c. Additive (Stage: checkout honesty): the promo code /api/checkout
  // validated and applied to this charge is marked redeemed against the real
  // payment — promo_redemptions row + used_count bump. NEVER THROWS and
  // idempotent (lib/payments/promo-redemption.ts), so it can never fail or
  // block fulfillment, which is already durably recorded above.
  if (a.promoCode) {
    await recordPromoRedemption({ paymentId: payment.id, userDbId, promoCode: a.promoCode });
  }

  // 3. Course purchase → enrollment (skip if already enrolled and active).
  await ensureCourseEnrollment(userDbId, a.productType, a.courseSlug, payment.id);

  // 4. Close the abandoned-cart tracking row.
  if (a.checkoutRowId) {
    await db
      .update(checkoutSessions)
      .set({ completedAt: new Date() })
      .where(eq(checkoutSessions.id, a.checkoutRowId));
  }

  // 5. Admin notification (bell in the admin shell).
  await db.insert(adminNotifications).values({
    kind: 'sale',
    severity: 'info',
    userId: userDbId,
    userName: user.name ?? user.email,
    amountCents: a.amountCents,
    detail: a.courseSlug ?? 'subscription',
  });

  // 6. Receipt email (safety-gated inside sendEmail — no-op in mock mode).
  // The whole block is wrapped defensively: a receipt-email or PDF-generation
  // failure must NEVER fail the webhook — the payment/enrollment above are
  // already durably recorded by this point, so this is best-effort only.
  try {
    const locale = user.localePref === 'fr' ? 'fr' : 'ht';
    const course = a.courseSlug ? await getCourseBySlug(a.courseSlug) : undefined;
    const itemName = course
      ? (locale === 'fr' ? course.title_fr : course.title_ht)
      : a.courseSlug ?? (locale === 'fr' ? 'Abonnement mensuel' : 'Abònman chak mwa');
    const dateIso = new Date().toISOString();
    // Task fix/fx-rate-unify: the receipt's "(~X HTG)" line reflects the
    // CURRENT admin-set DB rate, not a build-time constant — GATED +
    // NEVER-THROW (lib/fx.ts), so this can't newly break receipt sending.
    const rateHtg = await getFxRate();
    const receipt = buildReceiptHtml({
      locale,
      name: user.name,
      itemName,
      amountCents: a.amountCents,
      dateIso,
      ref: providerRef,
      rateHtg,
    });

    // Only bother generating the PDF when email is actually going to be sent
    // (RESEND_API_KEY present AND live data source / EMAIL_LIVE) — otherwise
    // this is pure no-op overhead. A PDF build failure degrades to a
    // plain-HTML receipt rather than skipping the email entirely.
    let attachments: { filename: string; content: string }[] | undefined;
    if (emailConfigured()) {
      try {
        const pdfBytes = await buildReceiptPdf({
          name: user.name,
          itemName,
          amountCents: a.amountCents,
          currency: a.currency,
          htgText: htgLabelAt(a.amountCents / 100, rateHtg),
          dateIso,
          ref: providerRef,
          locale,
        });
        attachments = [
          {
            filename: `pnice-receipt-${providerRef.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`,
            content: Buffer.from(pdfBytes).toString('base64'),
          },
        ];
      } catch (err) {
        console.error('[fulfill] receipt PDF generation failed (sending email without attachment):', err);
      }
    }

    await sendEmail({
      to: a.customerEmail ?? user.email,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
      ...(attachments ? { attachments } : {}),
    });
  } catch (err) {
    console.error('[fulfill] receipt email step failed (payment/enrollment already recorded):', err);
  }

  return 'processed';
}

type InvoicePaid = Extract<StripeAction, { kind: 'invoice_paid' }>;

async function fulfillInvoicePaid(a: InvoicePaid): Promise<'processed' | 'ignored'> {
  if (!a.subscriptionId) return 'ignored'; // one-off invoice, nothing to renew
  const sub = await selectSubscriptionByProviderRef(a.subscriptionId);
  if (!sub) {
    // First invoice can arrive before checkout.session.completed → let Stripe
    // retry (the completed handler will have created the row by then).
    throw new Error(`subscription ${a.subscriptionId} not in DB yet`);
  }

  const periodEnd = a.periodEnd ? new Date(a.periodEnd * 1000) : null;

  if (a.billingReason === 'subscription_create') {
    // The charge was already recorded by checkout.session.completed.
    await db
      .update(subscriptions)
      .set({ status: 'active', currentPeriodEnd: periodEnd, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    return 'processed';
  }

  // Renewal: record the recurring charge once. Fall back to an event-derived
  // ref when Stripe sends no payment_intent, so redeliveries still dedup
  // instead of double-recording revenue.
  const ref = a.paymentIntentId ?? `invoice_${a.eventId}`;
  if (await paymentExists(ref)) return 'processed';
  const insertedRenewals = await db
    .insert(payments)
    .values({
      userId: sub.userId,
      provider: 'stripe',
      providerRef: ref,
      amountCents: a.amountCents,
      currency: a.currency,
      status: 'completed',
      productType: 'subscription',
      courseSlug: null,
      relatedSubscriptionId: sub.id,
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerRef] })
    .returning({ id: payments.id });
  if (insertedRenewals.length === 0) return 'processed'; // concurrent delivery won the race

  // Additive: record the teacher's earnings-ledger 'sale' row for this
  // renewal charge. NEVER THROWS and internally idempotent (see
  // lib/teacher/earnings.ts's file header) — never blocks fulfillment.
  // teacherPlanId/kind come off OUR OWN `subscriptions` row (set once at
  // creation above), not re-parsed off the invoice — an `invoice.paid`
  // event carries no per-plan metadata of its own (Task: per-teacher
  // subscription checkout / Task: two subscription products).
  await recordSaleEarning({
    id: insertedRenewals[0].id,
    amountCents: a.amountCents,
    currency: a.currency,
    productType: 'subscription',
    courseSlug: null,
    teacherPlanId: sub.teacherPlanId,
    subscriptionKind: sub.kind,
  });

  await db
    .update(subscriptions)
    .set({ status: 'active', currentPeriodEnd: periodEnd, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));

  // Renewal receipt (Stage 6): the renewal branch used to record the payment
  // and send NOTHING. Reuses the first-purchase receipt builder with the
  // subscription's own naming (resolveSubscriptionNaming — same names
  // resolveProduct produced at purchase time). Only reached on the FIRST
  // recording of this charge (`insertedRenewals` non-empty above), so a
  // redelivered event never re-sends. NEVER THROWS: a receipt failure must
  // never fail the webhook — the payment is already durably recorded.
  try {
    const user = (
      await db.select().from(users).where(eq(users.id, sub.userId)).limit(1)
    )[0];
    if (user?.email) {
      const locale = user.localePref === 'fr' ? 'fr' : 'ht';
      const naming = await resolveSubscriptionNaming({ kind: sub.kind, teacherPlanId: sub.teacherPlanId });
      const rateHtg = await getFxRate();
      const receipt = buildReceiptHtml({
        locale,
        name: user.name,
        itemName: locale === 'fr' ? naming.nameFr : naming.nameHt,
        amountCents: a.amountCents,
        dateIso: new Date().toISOString(),
        ref,
        rateHtg,
      });
      await sendEmail({ to: user.email, subject: receipt.subject, html: receipt.html, text: receipt.text });
    }
  } catch (err) {
    console.error('[fulfill] renewal receipt email failed (payment already recorded):', err);
  }

  return 'processed';
}

type InvoiceFailed = Extract<StripeAction, { kind: 'invoice_failed' }>;

async function fulfillInvoiceFailed(a: InvoiceFailed): Promise<'processed' | 'ignored'> {
  if (!a.subscriptionId) return 'ignored';
  const sub = await selectSubscriptionByProviderRef(a.subscriptionId);
  if (!sub) return 'ignored';
  await db
    .update(subscriptions)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));
  await db.insert(adminNotifications).values({
    kind: 'payment_failed',
    severity: 'critical',
    userId: sub.userId,
    userName: null,
    amountCents: a.amountCents,
    detail: `Échec renouvellement (tentative ${a.attemptCount})`,
  });

  // Stage 6: dunning email to the LEARNER — before this, a failed renewal
  // only rang the admin bell and the learner was silently locked out at
  // period end. Links the /kont subscription tab. NEVER THROWS: an email
  // failure must never fail the webhook (a retry would re-insert the admin
  // notification above).
  try {
    const user = (
      await db.select().from(users).where(eq(users.id, sub.userId)).limit(1)
    )[0];
    if (user?.email) {
      const locale = user.localePref === 'fr' ? 'fr' : 'ht';
      const email = buildPaymentFailedHtml({ locale, name: user.name });
      await sendEmail({ to: user.email, subject: email.subject, html: email.html, text: email.text });
    }
  } catch (err) {
    console.error('[fulfill] payment-failed dunning email failed (status already recorded):', err);
  }
  return 'processed';
}

type SubscriptionUpdated = Extract<StripeAction, { kind: 'subscription_updated' }>;

/**
 * Stage: learner account — mirror an EXTERNAL subscription change (Stripe
 * billing portal, dashboard edit, dunning outcome) onto our own row, exactly
 * like the invoice handlers above map their events to status. ADDITIVE only:
 * no payment/enrollment/earnings write here — money guards frozen. Unknown
 * subscription ⇒ 'ignored': checkout.session.completed creates the row from
 * fresh remote state, so an early-arriving update has nothing to fix, and a
 * genuinely foreign id has nothing to do with us. Naturally idempotent — the
 * same event maps to the same UPDATE … SET every time.
 *
 * Fix (launch review pass): Stripe's ORDINARY cancellation flow sends
 * `customer.subscription.updated` (status → 'canceled') and THEN
 * `customer.subscription.deleted` for the very same cancellation — not two
 * deliveries of one event. That makes THIS handler the one that actually
 * observes the active → canceled transition; `fulfillSubscriptionDeleted`
 * below almost always finds the row already canceled and is a pure
 * idempotent ack with no notification of its own. So the 'sub_canceled'
 * admin bell is raised HERE, the first time (and only the first time) a
 * delivery flips this row into 'canceled' — gated on the OLD status read
 * before the update, so a redelivered event, or one arriving after
 * `fulfillSubscriptionDeleted` already canceled the row, never double-fires.
 */
async function fulfillSubscriptionUpdated(a: SubscriptionUpdated): Promise<'processed' | 'ignored'> {
  if (!a.subscriptionId) return 'ignored';
  const sub = await selectSubscriptionByProviderRef(a.subscriptionId);
  if (!sub) return 'ignored';
  const newStatus = mapStripeSubscriptionStatus(a.status);
  const isNewCancellation = newStatus === 'canceled' && sub.status !== 'canceled';
  await db
    .update(subscriptions)
    .set({
      status: newStatus,
      cancelAtPeriodEnd: a.cancelAtPeriodEnd,
      ...(a.periodEnd ? { currentPeriodEnd: new Date(a.periodEnd * 1000) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));
  if (isNewCancellation) {
    await db.insert(adminNotifications).values({
      kind: 'sub_canceled',
      severity: 'info',
      userId: sub.userId,
      userName: null,
      amountCents: null,
      detail: 'Abonnement annulé (Stripe)',
    });
  }
  return 'processed';
}

type SubscriptionDeleted = Extract<StripeAction, { kind: 'subscription_deleted' }>;

/**
 * Stage: learner account — a subscription cancelled OUTSIDE our app (billing
 * portal, Stripe dashboard, final dunning failure) finally reaches the DB —
 * before this handler the row stayed 'active' forever (zombie access).
 *
 * Fix (launch review pass): in Stripe's ordinary flow the sibling
 * `customer.subscription.updated` event (status → 'canceled') arrives FIRST
 * and already flips the row + raises the 'sub_canceled' notification
 * (`fulfillSubscriptionUpdated` above) — so THIS handler almost always finds
 * `sub.status === 'canceled'` already and is a pure idempotent ack (covers
 * both a genuine redelivery of `.deleted` itself AND the ordinary
 * updated-then-deleted pair). It still does the real cancel + notify work
 * itself for the out-of-order/edge case where `.deleted` arrives BEFORE (or
 * without) the `.updated` transition ever landing.
 */
async function fulfillSubscriptionDeleted(a: SubscriptionDeleted): Promise<'processed' | 'ignored'> {
  if (!a.subscriptionId) return 'ignored';
  const sub = await selectSubscriptionByProviderRef(a.subscriptionId);
  if (!sub) return 'ignored';
  if (sub.status === 'canceled') return 'processed'; // already canceled — by .updated above, or a genuine redelivery
  await db
    .update(subscriptions)
    .set({ status: 'canceled', cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));
  await db.insert(adminNotifications).values({
    kind: 'sub_canceled',
    severity: 'info',
    userId: sub.userId,
    userName: null,
    amountCents: null,
    detail: 'Abonnement annulé (Stripe)',
  });
  return 'processed';
}

type ChargeRefunded = Extract<StripeAction, { kind: 'charge_refunded' }>;
type RefundedPayment = typeof payments.$inferSelect;

/**
 * Best-effort refund confirmation email — shared by the full- and partial-
 * refund branches below (production hardening pass split this in two so a
 * partial refund can honestly report the ACTUAL amount refunded and never
 * claim access has ended). NEVER THROWS — the refund/reversal is already
 * durably recorded by the time this runs.
 */
async function sendRefundConfirmationEmail(
  payment: RefundedPayment,
  opts: { amountCents: number; fullRefund: boolean },
): Promise<void> {
  try {
    const user = (
      await db.select().from(users).where(eq(users.id, payment.userId)).limit(1)
    )[0];
    if (!user?.email) return;
    const locale = user.localePref === 'fr' ? 'fr' : 'ht';
    let itemName: string;
    if (payment.productType === 'course' && payment.courseSlug) {
      const course = await getCourseBySlug(payment.courseSlug);
      itemName = course
        ? locale === 'fr'
          ? course.title_fr
          : course.title_ht
        : payment.courseSlug;
    } else {
      const relatedSub = payment.relatedSubscriptionId
        ? (
            await db
              .select({ kind: subscriptions.kind, teacherPlanId: subscriptions.teacherPlanId })
              .from(subscriptions)
              .where(eq(subscriptions.id, payment.relatedSubscriptionId))
              .limit(1)
          )[0]
        : undefined;
      const naming = await resolveSubscriptionNaming({
        // Unknown ⇒ the neutral "Abònman chak mwa" label, not "Pass PNICE".
        kind: relatedSub?.kind ?? 'teacher',
        teacherPlanId: relatedSub?.teacherPlanId ?? null,
      });
      itemName = locale === 'fr' ? naming.nameFr : naming.nameHt;
    }
    const email = buildRefundConfirmationHtml({
      locale,
      name: user.name,
      itemName,
      amountCents: opts.amountCents,
      fullRefund: opts.fullRefund,
    });
    await sendEmail({ to: user.email, subject: email.subject, html: email.html, text: email.text });
  } catch (err) {
    console.error('[fulfill] refund confirmation email failed (refund already recorded):', err);
  }
}

async function fulfillChargeRefunded(a: ChargeRefunded): Promise<'processed' | 'ignored'> {
  if (!a.paymentIntentId) return 'ignored';
  const payment = (
    await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, 'stripe'), eq(payments.providerRef, a.paymentIntentId)))
      .limit(1)
  )[0];
  if (!payment) return 'ignored'; // refund of a charge we never recorded
  if (payment.status === 'refunded') return 'processed'; // already fully refunded — nothing left any branch below could do

  // Production hardening pass — Stripe's `refunded` boolean is the ONLY
  // reliable "is the ENTIRE charge refunded" signal (a partial refund's
  // `amount_refunded` is simply smaller than the charge, not zero, so it
  // can't be inferred from the amount alone). A partial/goodwill refund
  // must NEVER flip `payments.status`, revoke enrollment/subscription
  // access, fully reverse the teacher's earnings, or tell the buyer the
  // whole charge came back — that used to happen unconditionally here.
  if (a.fullyRefunded !== true) {
    const deltaCents = await recordPartialRefundReversal({ id: payment.id }, a.amountRefundedCents);
    if (deltaCents <= 0) return 'processed'; // redelivery of an amount already recorded — true no-op

    await db.insert(adminNotifications).values({
      kind: 'refund_request',
      severity: 'info',
      userId: payment.userId,
      userName: null,
      amountCents: deltaCents,
      detail: 'Remboursement partiel Stripe confirmé',
    });
    await sendRefundConfirmationEmail(payment, { amountCents: deltaCents, fullRefund: false });
    return 'processed';
  }

  await db.update(payments).set({ status: 'refunded' }).where(eq(payments.id, payment.id));

  // Additive: reverse the teacher's earnings-ledger 'sale' row for this
  // payment with a negative 'refund' row. NEVER THROWS (see
  // lib/teacher/earnings.ts's file header) — never blocks fulfillment.
  await recordRefundReversal({ id: payment.id });

  if (payment.productType === 'course') {
    await db
      .update(enrollments)
      .set({ status: 'refunded' })
      .where(eq(enrollments.relatedPaymentId, payment.id));
  }
  await db.insert(adminNotifications).values({
    kind: 'refund_request',
    severity: 'info',
    userId: payment.userId,
    userName: null,
    amountCents: payment.amountCents,
    detail: 'Remboursement Stripe confirmé',
  });

  // Stage 6: refund confirmation to the learner — before this, the refund
  // flipped access with no word to the person refunded. Only reached on the
  // FIRST processing (`payment.status === 'refunded'` short-circuits every
  // redelivery above). NEVER THROWS — the refund is already durably recorded.
  await sendRefundConfirmationEmail(payment, { amountCents: payment.amountCents, fullRefund: true });
  return 'processed';
}
