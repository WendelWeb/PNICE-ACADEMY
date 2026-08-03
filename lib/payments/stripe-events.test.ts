import { describe, it, expect } from 'vitest';
import { mapStripeEvent } from '@/lib/payments/stripe-events';

describe('mapStripeEvent', () => {
  it('maps checkout.session.completed (payment mode)', () => {
    const a = mapStripeEvent({
      id: 'evt_1', type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_1', mode: 'payment', client_reference_id: 'user-uuid',
        metadata: { checkoutRowId: 'row-uuid', productType: 'course', courseSlug: 'zouti-finansye-dijital', userDbId: 'user-uuid' },
        amount_total: 900, currency: 'usd', payment_intent: 'pi_1',
        subscription: null, customer_details: { email: 'x@y.com' },
      } },
    });
    expect(a).toEqual({
      kind: 'checkout_completed', eventId: 'evt_1', sessionId: 'cs_1',
      mode: 'payment', userDbId: 'user-uuid', checkoutRowId: 'row-uuid',
      productType: 'course', courseSlug: 'zouti-finansye-dijital',
      amountCents: 900, currency: 'USD', paymentIntentId: 'pi_1',
      subscriptionId: null, customerEmail: 'x@y.com', teacherPlanId: null,
      subscriptionKind: 'platform', promoCode: null,
    });
  });

  // Stage: checkout honesty — `metadata[promoCode]` (written by
  // lib/payments/stripe.ts when /api/checkout applied a validated code) is
  // read back here so fulfillment can mark the redemption.
  it('carries metadata[promoCode] through, null when absent or empty', () => {
    const base = {
      id: 'evt_p', type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_p', mode: 'payment', client_reference_id: 'user-uuid',
        metadata: { productType: 'course', courseSlug: 'x', promoCode: 'LANSMAN20' },
        amount_total: 720, currency: 'usd',
      } },
    };
    const withCode = mapStripeEvent(base);
    expect(withCode.kind).toBe('checkout_completed');
    if (withCode.kind === 'checkout_completed') expect(withCode.promoCode).toBe('LANSMAN20');

    const without = mapStripeEvent({
      ...base,
      data: { object: { ...base.data.object, metadata: { productType: 'course', courseSlug: 'x' } } },
    });
    if (without.kind === 'checkout_completed') expect(without.promoCode).toBeNull();

    const empty = mapStripeEvent({
      ...base,
      data: { object: { ...base.data.object, metadata: { productType: 'course', courseSlug: 'x', promoCode: '' } } },
    });
    if (empty.kind === 'checkout_completed') expect(empty.promoCode).toBeNull();
  });

  it('maps checkout.session.completed (subscription mode)', () => {
    const a = mapStripeEvent({
      id: 'evt_2', type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_2', mode: 'subscription', client_reference_id: 'user-uuid',
        metadata: { checkoutRowId: 'row-2', productType: 'subscription' },
        amount_total: 7900, currency: 'usd', payment_intent: null,
        subscription: 'sub_1', customer_details: null,
      } },
    });
    expect(a.kind).toBe('checkout_completed');
    if (a.kind === 'checkout_completed') {
      expect(a.subscriptionId).toBe('sub_1');
      expect(a.productType).toBe('subscription');
      expect(a.courseSlug).toBeNull();
      expect(a.customerEmail).toBeNull();
      expect(a.teacherPlanId).toBeNull();
      // No metadata[kind] on this payload — defaults to 'platform', the same
      // conservative "unknown ⇒ all-access" choice as the DB column default.
      expect(a.subscriptionKind).toBe('platform');
    }
  });

  // Task: per-teacher subscription checkout — lib/payments/stripe.ts writes
  // `metadata[teacherPlanId]` only for a resolved per-teacher (or teacher-#1
  // default) plan; this is the ONE place that metadata is read back off the
  // webhook payload for lib/payments/fulfill.ts to store on the local
  // `subscriptions` row and lib/teacher/earnings.ts to credit correctly.
  it('maps checkout.session.completed with a teacherPlanId (per-teacher subscription)', () => {
    const a = mapStripeEvent({
      id: 'evt_2b', type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_2b', mode: 'subscription', client_reference_id: 'user-uuid',
        metadata: { checkoutRowId: 'row-2b', productType: 'subscription', teacherPlanId: 'plan-uuid' },
        amount_total: 3000, currency: 'usd', payment_intent: null,
        subscription: 'sub_2b', customer_details: null,
      } },
    });
    expect(a.kind).toBe('checkout_completed');
    if (a.kind === 'checkout_completed') expect(a.teacherPlanId).toBe('plan-uuid');
  });

  // Task: two subscription products.
  it('maps metadata[kind]=teacher and =platform explicitly, and defaults an unknown value to platform', () => {
    const build = (kind: unknown) =>
      mapStripeEvent({
        id: 'evt_kind', type: 'checkout.session.completed',
        data: { object: {
          id: 'cs_kind', mode: 'subscription', client_reference_id: 'user-uuid',
          metadata: { checkoutRowId: 'row-kind', productType: 'subscription', kind },
          amount_total: 7900, currency: 'usd', payment_intent: null,
          subscription: 'sub_kind', customer_details: null,
        } },
      });
    const teacherAction = build('teacher');
    const platformAction = build('platform');
    const junkAction = build('nonsense');
    if (teacherAction.kind === 'checkout_completed') expect(teacherAction.subscriptionKind).toBe('teacher');
    if (platformAction.kind === 'checkout_completed') expect(platformAction.subscriptionKind).toBe('platform');
    if (junkAction.kind === 'checkout_completed') expect(junkAction.subscriptionKind).toBe('platform');
  });

  it('maps invoice.paid with billing reason + period end', () => {
    const a = mapStripeEvent({
      id: 'evt_3', type: 'invoice.paid',
      data: { object: {
        subscription: 'sub_1', payment_intent: 'pi_9', amount_paid: 7900,
        currency: 'usd', billing_reason: 'subscription_cycle',
        lines: { data: [{ period: { end: 1750000000 } }] },
      } },
    });
    expect(a).toEqual({
      kind: 'invoice_paid', eventId: 'evt_3', subscriptionId: 'sub_1',
      paymentIntentId: 'pi_9', amountCents: 7900, currency: 'USD',
      billingReason: 'subscription_cycle', periodEnd: 1750000000,
    });
  });

  it('maps invoice.paid with the Basil (2025-03-31+) payload shape', () => {
    const a = mapStripeEvent({
      id: 'evt_b1', type: 'invoice.paid',
      data: { object: {
        parent: { subscription_details: { subscription: 'sub_9' } },
        amount_paid: 7900, currency: 'usd', billing_reason: 'subscription_cycle',
        lines: { data: [{ period: { end: 1760000000 } }] },
      } },
    });
    expect(a.kind).toBe('invoice_paid');
    if (a.kind === 'invoice_paid') {
      expect(a.subscriptionId).toBe('sub_9');
      expect(a.paymentIntentId).toBeNull();
    }
  });

  it('maps invoice.payment_failed', () => {
    const a = mapStripeEvent({
      id: 'evt_4', type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_1', amount_due: 7900, attempt_count: 2 } },
    });
    expect(a).toEqual({ kind: 'invoice_failed', eventId: 'evt_4', subscriptionId: 'sub_1', amountCents: 7900, attemptCount: 2 });
  });

  it('maps charge.refunded via payment_intent', () => {
    const a = mapStripeEvent({
      id: 'evt_5', type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_1' } },
    });
    expect(a).toEqual({ kind: 'charge_refunded', eventId: 'evt_5', paymentIntentId: 'pi_1' });
  });

  it('ignores unknown event types and malformed events', () => {
    expect(mapStripeEvent({ id: 'evt_6', type: 'customer.created', data: { object: {} } }))
      .toEqual({ kind: 'ignored', eventId: 'evt_6', type: 'customer.created' });
    expect(mapStripeEvent(null)).toEqual({ kind: 'ignored', eventId: 'unknown', type: 'unknown' });
  });
});
