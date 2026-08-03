/**
 * Minimal Stripe REST client — `fetch` only, no SDK (repo pattern).
 * SECURITY: the secret key is read from env at call time, never logged/returned.
 */
import type { ResolvedProduct } from './products';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2024-06-20';

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Flatten params into Stripe's bracketed form encoding. Skips null/undefined. */
export function stripeFormEncode(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function stripeRequest<T>(
  method: 'POST' | 'GET',
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<StripeResult<T>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: 'stripe_not_configured' };
  const qs = method === 'GET' && params ? `?${stripeFormEncode(params)}` : '';
  try {
    const res = await fetch(`${STRIPE_API}${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Stripe-Version': STRIPE_VERSION,
        ...(method === 'POST'
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : {}),
      },
      body: method === 'POST' && params ? stripeFormEncode(params) : undefined,
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network_error' };
  }
}

export type StripeCheckoutInput = {
  mode: 'payment' | 'subscription';
  product: ResolvedProduct;
  /** Our users.id (uuid) — round-trips via client_reference_id + metadata. */
  userDbId: string;
  /** Our checkout_sessions.id (uuid) — round-trips via metadata. */
  checkoutRowId: string;
  customerEmail: string;
  locale: 'fr' | 'ht';
  successUrl: string;
  cancelUrl: string;
  /** Stage: checkout honesty — the promo code /api/checkout validated and
   *  ALREADY applied to `product.amountCents` before calling here. Carried
   *  as metadata only (never re-priced in this module) so fulfillment
   *  (lib/payments/fulfill.ts → lib/payments/promo-redemption.ts) can mark
   *  the redemption against the real payment. Absent = no code applied. */
  promoCode?: string | null;
};

export async function createStripeCheckout(
  input: StripeCheckoutInput,
): Promise<{ id: string; url: string } | { error: string }> {
  const name = input.locale === 'fr' ? input.product.nameFr : input.product.nameHt;
  const params: Record<string, string | number | boolean> = {
    mode: input.mode,
    client_reference_id: input.userDbId,
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Stripe has no Kreyòl locale; French is the closest for both site locales.
    locale: 'fr',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': input.product.amountCents,
    'line_items[0][price_data][product_data][name]': name,
    'metadata[checkoutRowId]': input.checkoutRowId,
    'metadata[userDbId]': input.userDbId,
    'metadata[productType]': input.product.productType,
  };
  if (input.product.courseSlug) params['metadata[courseSlug]'] = input.product.courseSlug;
  // Stage: checkout honesty — the validated promo code rides along so the
  // webhook can record the redemption (promo_redemptions + used_count) against
  // the real payment. The AMOUNT was already discounted by the caller
  // (/api/checkout via lib/payments/promo.ts) — this is bookkeeping only.
  if (input.promoCode) params['metadata[promoCode]'] = input.promoCode;
  // Task: per-teacher subscription checkout — carry the resolved plan/owner
  // through Stripe so lib/payments/fulfill.ts can store it on the local
  // `subscriptions` row and lib/teacher/earnings.ts can credit the RIGHT
  // teacher's 70% instead of guessing "the first active plan". Only set for
  // a subscription that actually resolved to a specific plan (see
  // lib/payments/products.ts) — absent for a course purchase, or the rare
  // no-DB platform-default fallback, exactly mirroring `courseSlug` above.
  if (input.product.teacherPlanId) params['metadata[teacherPlanId]'] = input.product.teacherPlanId;
  if (input.product.teacherUserId) params['metadata[teacherUserId]'] = input.product.teacherUserId;
  // Task: two subscription products — which pass this is ('teacher' | null
  // for a course purchase, since `kind` is a subscription-only concept).
  // lib/payments/stripe-events.ts reads this back off the webhook payload so
  // lib/payments/fulfill.ts can store it on the local `subscriptions` row.
  if (input.product.kind) params['metadata[kind]'] = input.product.kind;
  if (input.mode === 'subscription') {
    params['line_items[0][price_data][recurring][interval]'] = 'month';
    params['subscription_data[metadata][userDbId]'] = input.userDbId;
    if (input.product.teacherPlanId) params['subscription_data[metadata][teacherPlanId]'] = input.product.teacherPlanId;
    if (input.product.teacherUserId) params['subscription_data[metadata][teacherUserId]'] = input.product.teacherUserId;
    if (input.product.kind) params['subscription_data[metadata][kind]'] = input.product.kind;
  } else {
    params['payment_intent_data[metadata][userDbId]'] = input.userDbId;
  }
  const res = await stripeRequest<{ id: string; url: string }>(
    'POST',
    '/checkout/sessions',
    params,
  );
  return res.ok ? { id: res.data.id, url: res.data.url } : { error: res.error };
}

export type StripeSessionSummary = {
  /** The buyer-facing payment reference: the payment intent when Stripe
   *  provides one, else the session id itself. */
  reference: string;
  paymentStatus: string;
  amountCents: number;
  currency: string;
  /** First line item's display name — what was actually bought. */
  itemName: string | null;
};

/**
 * Read back a Checkout Session so the merci page can show what was REALLY
 * bought (Stage: checkout honesty) — item, amount, reference — instead of a
 * generic screen. GATED + NEVER-THROW: no key, a malformed id, or any
 * API/network failure resolves to `null` and the page degrades to its
 * generic state. The id is shape-checked before being interpolated into the
 * request path.
 */
export async function getStripeCheckoutSession(id: string): Promise<StripeSessionSummary | null> {
  if (!/^cs_[A-Za-z0-9_]{8,240}$/.test(id)) return null;
  const res = await stripeRequest<{
    id: string;
    payment_status?: string;
    amount_total?: number | null;
    currency?: string | null;
    payment_intent?: string | null;
    line_items?: { data?: { description?: string | null }[] };
  }>('GET', `/checkout/sessions/${id}`, { 'expand[]': 'line_items' });
  if (!res.ok) return null;
  const s = res.data;
  return {
    reference: typeof s.payment_intent === 'string' && s.payment_intent ? s.payment_intent : s.id,
    paymentStatus: typeof s.payment_status === 'string' ? s.payment_status : 'unknown',
    amountCents: typeof s.amount_total === 'number' && Number.isFinite(s.amount_total) ? s.amount_total : 0,
    currency: (s.currency ?? 'usd').toUpperCase(),
    itemName: s.line_items?.data?.[0]?.description ?? null,
  };
}

/**
 * The Stripe customer id behind one of OUR subscriptions (Stage: learner
 * account). We never stored customer ids locally — the subscription's
 * provider_ref is the durable key — so the billing portal resolves the
 * customer through the subscription at click time. GATED + NEVER-THROW:
 * no key / bad id / API failure ⇒ `null` and the caller degrades politely.
 */
export async function getStripeSubscriptionCustomerId(id: string): Promise<string | null> {
  if (!/^sub_[A-Za-z0-9_]{3,240}$/.test(id)) return null;
  const res = await stripeRequest<{ customer?: string | { id?: string } | null }>(
    'GET',
    `/subscriptions/${id}`,
  );
  if (!res.ok) return null;
  const c = res.data.customer;
  if (typeof c === 'string' && c) return c;
  if (c && typeof c === 'object' && typeof c.id === 'string' && c.id) return c.id;
  return null;
}

/**
 * Stripe billing-portal session (Stage: learner account) — the hosted page
 * where a subscriber updates their card or cancels, so "Jere abònman an"
 * is real self-service instead of a support ticket. Plain REST like
 * everything else in this file. Never throws — `{ error }` on any failure.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string } | { error: string }> {
  const res = await stripeRequest<{ url: string }>('POST', '/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  });
  return res.ok ? { url: res.data.url } : { error: res.error };
}

export async function getStripeSubscription(id: string): Promise<{
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  const res = await stripeRequest<{
    status: string;
    current_period_end: number | null;
    cancel_at_period_end: boolean;
  }>('GET', `/subscriptions/${id}`);
  if (!res.ok) return null;
  return {
    status: res.data.status,
    currentPeriodEnd: res.data.current_period_end
      ? new Date(res.data.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: !!res.data.cancel_at_period_end,
  };
}
