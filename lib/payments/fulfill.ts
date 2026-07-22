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

type CheckoutCompleted = Extract<StripeAction, { kind: 'checkout_completed' }>;

async function fulfillCheckoutCompleted(a: CheckoutCompleted): Promise<'processed' | 'ignored'> {
  if (!a.userDbId) throw new Error('checkout.session.completed without client_reference_id');
  const providerRef = a.paymentIntentId ?? a.sessionId;
  if (await paymentExists(providerRef)) return 'processed'; // retry duplicate

  const user = (
    await db.select().from(users).where(eq(users.id, a.userDbId)).limit(1)
  )[0];
  if (!user) throw new Error(`user ${a.userDbId} not found for checkout ${a.sessionId}`);

  // 1. Subscription row first (payment row links to it).
  let subscriptionRowId: string | null = null;
  if (a.mode === 'subscription' && a.subscriptionId) {
    const existing = (
      await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.providerRef, a.subscriptionId))
        .limit(1)
    )[0];
    if (existing) {
      subscriptionRowId = existing.id;
    } else {
      const remote = await getStripeSubscription(a.subscriptionId);
      const inserted = (
        await db
          .insert(subscriptions)
          .values({
            userId: a.userDbId,
            status: 'active',
            provider: 'stripe',
            providerRef: a.subscriptionId,
            currentPeriodEnd: remote?.currentPeriodEnd ?? null,
          })
          .returning({ id: subscriptions.id })
      )[0];
      subscriptionRowId = inserted.id;
    }
  }

  // 2. Payment row.
  const payment = (
    await db
      .insert(payments)
      .values({
        userId: a.userDbId,
        provider: 'stripe',
        providerRef,
        amountCents: a.amountCents,
        currency: a.currency,
        status: 'completed',
        productType: a.productType,
        courseSlug: a.courseSlug,
        relatedSubscriptionId: subscriptionRowId,
      })
      .returning({ id: payments.id })
  )[0];

  // 3. Course purchase → enrollment (skip if already enrolled and active).
  if (a.productType === 'course' && a.courseSlug) {
    const already = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, a.userDbId),
          eq(enrollments.courseSlug, a.courseSlug),
          eq(enrollments.status, 'active'),
        ),
      )
      .limit(1);
    if (already.length === 0) {
      await db.insert(enrollments).values({
        userId: a.userDbId,
        courseSlug: a.courseSlug,
        status: 'active',
        relatedPaymentId: payment.id,
      });
    }
  }

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
    userId: a.userDbId,
    userName: user.name ?? user.email,
    amountCents: a.amountCents,
    detail: a.courseSlug ?? 'subscription',
  });

  // 6. Receipt email (safety-gated inside sendEmail — no-op in mock mode).
  const locale = user.localePref === 'fr' ? 'fr' : 'ht';
  const itemName = a.courseSlug ?? (locale === 'fr' ? 'Abonnement mensuel' : 'Abònman chak mwa');
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

  // Renewal: record the recurring charge once.
  if (a.paymentIntentId && (await paymentExists(a.paymentIntentId))) return 'processed';
  await db.insert(payments).values({
    userId: sub.userId,
    provider: 'stripe',
    providerRef: a.paymentIntentId ?? `invoice_${a.eventId}`,
    amountCents: a.amountCents,
    currency: a.currency,
    status: 'completed',
    productType: 'subscription',
    courseSlug: null,
    relatedSubscriptionId: sub.id,
  });
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
