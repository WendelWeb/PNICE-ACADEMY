/**
 * Pure mapper: raw Stripe webhook JSON → typed action. All null-safety lives
 * here so lib/payments/fulfill.ts can trust its inputs.
 */
export type StripeAction =
  | { kind: 'checkout_completed'; eventId: string; sessionId: string;
      mode: 'payment' | 'subscription'; userDbId: string | null;
      checkoutRowId: string | null; productType: 'course' | 'subscription';
      courseSlug: string | null; amountCents: number; currency: string;
      paymentIntentId: string | null; subscriptionId: string | null;
      customerEmail: string | null;
      /** Task: per-teacher subscription checkout — the specific
       *  `teacher_plans.id` charged (lib/payments/products.ts), when the
       *  purchase resolved to one. `null` for a course purchase or the
       *  no-DB platform-default fallback. */
      teacherPlanId: string | null;
      /** Task: two subscription products — 'teacher' | 'platform', read off
       *  `metadata[kind]` (lib/payments/stripe.ts). Defaults to 'platform'
       *  when absent (a course purchase — this field is ignored either way —
       *  or an in-flight checkout session created before this metadata
       *  existed): the SAME conservative "unknown ⇒ all-access, never
       *  retroactively locked out" choice as the `subscriptions.kind` column
       *  default (db/schema.ts). */
      subscriptionKind: 'teacher' | 'platform';
      /** Stage: checkout honesty — the promo code /api/checkout validated
       *  and applied to this session's amount, read off
       *  `metadata[promoCode]`. `null` when no code was applied (every
       *  session created before this stage included). Fulfillment marks the
       *  redemption (lib/payments/promo-redemption.ts). */
      promoCode: string | null }
  | { kind: 'invoice_paid'; eventId: string; subscriptionId: string | null;
      paymentIntentId: string | null; amountCents: number; currency: string;
      billingReason: string | null; periodEnd: number | null }
  | { kind: 'invoice_failed'; eventId: string; subscriptionId: string | null;
      amountCents: number; attemptCount: number }
  | { kind: 'charge_refunded'; eventId: string; paymentIntentId: string | null }
  | { kind: 'ignored'; eventId: string; type: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: any): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: any): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function mapStripeEvent(evt: unknown): StripeAction {
  const e = evt as any;
  const eventId = str(e?.id) ?? 'unknown';
  const type = str(e?.type) ?? 'unknown';
  const o = e?.data?.object ?? {};

  if (type === 'checkout.session.completed') {
    const meta = o.metadata ?? {};
    const mode: 'payment' | 'subscription' = o.mode === 'subscription' ? 'subscription' : 'payment';
    return {
      kind: 'checkout_completed',
      eventId,
      sessionId: str(o.id) ?? 'unknown',
      mode,
      userDbId: str(o.client_reference_id) ?? str(meta.userDbId),
      checkoutRowId: str(meta.checkoutRowId),
      productType: meta.productType === 'subscription' || mode === 'subscription' ? 'subscription' : 'course',
      courseSlug: str(meta.courseSlug),
      amountCents: num(o.amount_total),
      currency: (str(o.currency) ?? 'usd').toUpperCase(),
      paymentIntentId: str(o.payment_intent),
      subscriptionId: str(o.subscription),
      customerEmail: str(o.customer_details?.email),
      teacherPlanId: str(meta.teacherPlanId),
      subscriptionKind: meta.kind === 'teacher' ? 'teacher' : 'platform',
      promoCode: str(meta.promoCode),
    };
  }
  if (type === 'invoice.paid') {
    return {
      kind: 'invoice_paid',
      eventId,
      subscriptionId: str(o.subscription) ?? str(o.parent?.subscription_details?.subscription),
      paymentIntentId: str(o.payment_intent),
      amountCents: num(o.amount_paid),
      currency: (str(o.currency) ?? 'usd').toUpperCase(),
      billingReason: str(o.billing_reason),
      periodEnd: typeof o.lines?.data?.[0]?.period?.end === 'number' ? o.lines.data[0].period.end : null,
    };
  }
  if (type === 'invoice.payment_failed') {
    return {
      kind: 'invoice_failed',
      eventId,
      subscriptionId: str(o.subscription) ?? str(o.parent?.subscription_details?.subscription),
      amountCents: num(o.amount_due),
      attemptCount: num(o.attempt_count),
    };
  }
  if (type === 'charge.refunded') {
    return { kind: 'charge_refunded', eventId, paymentIntentId: str(o.payment_intent) };
  }
  return { kind: 'ignored', eventId, type };
}
