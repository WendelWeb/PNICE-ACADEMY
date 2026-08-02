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
