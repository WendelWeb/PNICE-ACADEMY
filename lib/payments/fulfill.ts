/**
 * Stripe fulfillment — the ONLY place webhook events touch the DB.
 * Idempotent by payments.provider_ref: Stripe retries events, and
 * checkout.session.completed + invoice.paid can describe the same charge.
 */
import { db } from '@/db';
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
import { sendEmail } from '@/lib/email/resend';
import { buildReceiptHtml } from '@/lib/email/templates';
import { getCourse } from '@/data/courses';
import type { StripeAction } from './stripe-events';

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
    default:
      return 'ignored';
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

async function findPaymentByRef(providerRef: string): Promise<{ id: string } | undefined> {
  return (
    await db
      .select({ id: payments.id })
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
  if (!a.userDbId) throw new Error('checkout.session.completed without client_reference_id');
  const userDbId = a.userDbId;
  const providerRef = a.paymentIntentId ?? a.sessionId;

  const existingPayment = await findPaymentByRef(providerRef);
  if (existingPayment) {
    // Retry duplicate. A prior delivery may have recorded the payment but
    // failed before the enrollment insert landed — re-run the idempotent
    // enrollment upsert so access self-heals. Do not resend the receipt
    // email or re-insert the sale notification on this path.
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
      const insertedSubscriptions = await db
        .insert(subscriptions)
        .values({
          userId: userDbId,
          status: 'active',
          provider: 'stripe',
          providerRef: subscriptionId,
          currentPeriodEnd: remote?.currentPeriodEnd ?? null,
        })
        .onConflictDoNothing({ target: subscriptions.providerRef })
        .returning({ id: subscriptions.id });
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
    await ensureCourseEnrollment(userDbId, a.productType, a.courseSlug, raced.id);
    return 'processed';
  }
  const payment = insertedPayments[0];

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
  const locale = user.localePref === 'fr' ? 'fr' : 'ht';
  const course = a.courseSlug ? getCourse(a.courseSlug) : undefined;
  const itemName = course
    ? (locale === 'fr' ? course.title_fr : course.title_ht)
    : a.courseSlug ?? (locale === 'fr' ? 'Abonnement mensuel' : 'Abònman chak mwa');
  const receipt = buildReceiptHtml({
    locale,
    name: user.name,
    itemName,
    amountCents: a.amountCents,
    dateIso: new Date().toISOString(),
    ref: providerRef,
  });
  await sendEmail({
    to: a.customerEmail ?? user.email,
    subject: receipt.subject,
    html: receipt.html,
  });

  return 'processed';
}

type InvoicePaid = Extract<StripeAction, { kind: 'invoice_paid' }>;

async function fulfillInvoicePaid(a: InvoicePaid): Promise<'processed' | 'ignored'> {
  if (!a.subscriptionId) return 'ignored'; // one-off invoice, nothing to renew
  const sub = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.providerRef, a.subscriptionId))
      .limit(1)
  )[0];
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
  await db
    .update(subscriptions)
    .set({ status: 'active', currentPeriodEnd: periodEnd, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));
  return 'processed';
}

type InvoiceFailed = Extract<StripeAction, { kind: 'invoice_failed' }>;

async function fulfillInvoiceFailed(a: InvoiceFailed): Promise<'processed' | 'ignored'> {
  if (!a.subscriptionId) return 'ignored';
  const sub = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.providerRef, a.subscriptionId))
      .limit(1)
  )[0];
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
  return 'processed';
}

type ChargeRefunded = Extract<StripeAction, { kind: 'charge_refunded' }>;

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
  if (payment.status === 'refunded') return 'processed'; // duplicate
  await db.update(payments).set({ status: 'refunded' }).where(eq(payments.id, payment.id));
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
  return 'processed';
}
