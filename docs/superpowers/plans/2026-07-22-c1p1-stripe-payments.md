# C1-P1 — Paiement Stripe de bout en bout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in learner can really buy a course (one-off) or the $79/mo subscription with a card via Stripe Checkout; webhooks write `payments`/`enrollments`/`subscriptions`/`webhook_logs`, send a receipt email, and the admin Transactions screen reads real rows.

**Architecture:** No Stripe SDK — REST via `fetch` + manual webhook signature verification (repo pattern: Svix and Resend are already SDK-free). One pure "action mapper" turns raw Stripe events into a typed union; one fulfillment module does all DB writes; thin API routes. Admin reads through the existing single switch point (`lib/admin/data/index.ts`) — the transactions domain joins the incremental `realDataSource()`.

**Tech Stack:** Next.js 14 App Router (nodejs runtime routes), Clerk v6 (`await auth()`), Drizzle + Neon (`@/db`), vitest 2, Stripe REST API (pinned `Stripe-Version: 2024-06-20`), Stripe CLI for local webhook forwarding.

## Global Constraints

- **No new runtime dependencies.** Stripe via `fetch` only. (Dev-only additions allowed: none needed.)
- Money = **cents (int) + currency 'USD'**; HTG derived for display only (`lib/money.ts toHtg`).
- Prices come from `data/courses.ts` (`priceUsd`, placeholders) and `data/pricing.ts` (`SUBSCRIPTION_USD = 79`). Never hardcode amounts elsewhere.
- **Promo codes must NOT discount real charges in this plan.** The promo domain is still mock-backed; applying mock-seeded codes to real money is a security hole. Discount + redemption land in C1-P3 with the real marketing domain. The checkout UI keeps its "démo" tag on the promo field.
- Secrets only via env (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); never logged, never returned.
- Emails go through `lib/email/resend.ts` `sendEmail` (already safety-gated: key + `ADMIN_DATA_SOURCE=real` or `EMAIL_LIVE=true`). Callers never check the gate themselves.
- All user-facing strings bilingual **ht + fr** in `messages/ht.json` + `messages/fr.json`.
- DB vocabulary mapping (same as `lib/admin/data/real/users.ts`): payments status `completed`→UI `succeeded`; provider `stripe`→UI method `card`.
- Every task: `npx tsc --noEmit` must stay green before commit. `npm test` runs vitest.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
lib/payments/products.ts        product resolution (slug/sub → name + cents)   [new]
lib/payments/checkout-body.ts   request-body validation (pure)                 [new]
lib/payments/stripe.ts          Stripe REST client (form-encode, checkout,
                                subscription fetch)                            [new]
lib/payments/stripe-verify.ts   webhook signature verification (pure)          [new]
lib/payments/stripe-events.ts   raw event → typed StripeAction (pure)          [new]
lib/payments/fulfill.ts         all DB writes + receipt email                  [new]
lib/email/templates.ts          buildReceiptHtml (pure, bilingual)             [new]
app/api/checkout/route.ts       POST create checkout session                   [new]
app/api/webhooks/stripe/route.ts POST webhook receiver                         [new]
app/[locale]/(site)/checkout/merci/page.tsx  success page                      [new]
components/checkout/PaymentMethods.tsx  wire the card button                   [modify]
app/[locale]/(site)/checkout/page.tsx   pass product props                     [modify]
lib/admin/data/real/transactions.ts  real getTransactions/export/volumes      [new]
lib/admin/data/real/index.ts    spread transactions domain                     [modify]
scripts/check-payments.ts       live-DB verification harness                   [new]
vitest.config.ts                '@' alias for tests                            [new]
messages/fr.json + ht.json      merci.* + checkout.payErr/redirect keys        [modify]
docs/launch-checklist.md        step 4 → implemented, verify via runbook       [modify]
```

---

### Task 1: Product resolution (`lib/payments/products.ts`)

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/payments/products.ts`
- Test: `lib/payments/products.test.ts`

**Interfaces:**
- Consumes: `courses` from `@/data/courses`, `SUBSCRIPTION_USD` from `@/data/pricing`.
- Produces: `type ResolvedProduct = { productType: 'course' | 'subscription'; courseSlug: string | null; nameFr: string; nameHt: string; amountCents: number }` and `resolveProduct(input: { productType: 'course' | 'subscription'; courseSlug?: string | null }): ResolvedProduct | null` — used by Tasks 3, 7.

- [ ] **Step 1: Create `vitest.config.ts`** (tests will import via the `@/` alias like the rest of the repo)

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { environment: 'node' },
});
```

- [ ] **Step 2: Write the failing test** — `lib/payments/products.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { resolveProduct } from '@/lib/payments/products';
import { courses } from '@/data/courses';
import { SUBSCRIPTION_USD } from '@/data/pricing';

describe('resolveProduct', () => {
  it('resolves the subscription at the canonical price', () => {
    const p = resolveProduct({ productType: 'subscription' });
    expect(p).not.toBeNull();
    expect(p!.amountCents).toBe(SUBSCRIPTION_USD * 100);
    expect(p!.courseSlug).toBeNull();
    expect(p!.productType).toBe('subscription');
  });

  it('resolves every catalog course with its own price in cents', () => {
    for (const c of courses) {
      const p = resolveProduct({ productType: 'course', courseSlug: c.slug });
      expect(p, c.slug).not.toBeNull();
      expect(p!.amountCents).toBe(Math.round(c.priceUsd * 100));
      expect(p!.nameFr).toBe(c.title_fr);
      expect(p!.nameHt).toBe(c.title_ht);
    }
  });

  it('returns null for an unknown slug and for course without slug', () => {
    expect(resolveProduct({ productType: 'course', courseSlug: 'nope' })).toBeNull();
    expect(resolveProduct({ productType: 'course' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/payments/products.test.ts`
Expected: FAIL — cannot resolve `@/lib/payments/products`.

- [ ] **Step 4: Write the implementation** — `lib/payments/products.ts`

```ts
/**
 * Resolve what is being bought into a display name + amount in cents.
 * Single source of truth for checkout amounts: data/courses.ts + data/pricing.ts.
 */
import { courses } from '@/data/courses';
import { SUBSCRIPTION_USD } from '@/data/pricing';

export type ResolvedProduct = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  nameFr: string;
  nameHt: string;
  amountCents: number;
};

export function resolveProduct(input: {
  productType: 'course' | 'subscription';
  courseSlug?: string | null;
}): ResolvedProduct | null {
  if (input.productType === 'subscription') {
    return {
      productType: 'subscription',
      courseSlug: null,
      nameFr: 'Abonnement mensuel PNICE Academy',
      nameHt: 'Abònman chak mwa PNICE Academy',
      amountCents: SUBSCRIPTION_USD * 100,
    };
  }
  const course = courses.find((c) => c.slug === input.courseSlug);
  if (!course) return null;
  return {
    productType: 'course',
    courseSlug: course.slug,
    nameFr: course.title_fr,
    nameHt: course.title_ht,
    amountCents: Math.round(course.priceUsd * 100),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/payments/products.test.ts` → PASS. Also `npm test` (money.test.ts must still pass with the new config) and `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts lib/payments/products.ts lib/payments/products.test.ts
git commit -m "feat(payments): product resolution for checkout amounts"
```

---

### Task 2: Webhook signature verification (`lib/payments/stripe-verify.ts`)

**Files:**
- Create: `lib/payments/stripe-verify.ts`
- Test: `lib/payments/stripe-verify.test.ts`

**Interfaces:**
- Produces: `verifyStripeSignature(payload: string, sigHeader: string | null, secret: string, nowSec?: number, toleranceSec?: number): boolean` — used by Task 8.

- [ ] **Step 1: Write the failing test** — `lib/payments/stripe-verify.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature } from '@/lib/payments/stripe-verify';

const SECRET = 'whsec_test_secret';
const PAYLOAD = '{"id":"evt_1","type":"checkout.session.completed"}';

function sign(payload: string, secret: string, t: number): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifyStripeSignature', () => {
  const now = 1_700_000_000;

  it('accepts a valid signature within tolerance', () => {
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, SECRET, now - 10), SECRET, now)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, 'whsec_other', now), SECRET, now)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    expect(verifyStripeSignature(PAYLOAD + 'x', sign(PAYLOAD, SECRET, now), SECRET, now)).toBe(false);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, SECRET, now - 3600), SECRET, now)).toBe(false);
  });

  it('rejects null/malformed headers and empty secret', () => {
    expect(verifyStripeSignature(PAYLOAD, null, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD, 'garbage', SECRET, now)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, SECRET, now), '', now)).toBe(false);
  });

  it('accepts when one of several v1 entries matches', () => {
    const good = sign(PAYLOAD, SECRET, now);
    const withExtra = `${good},v1=${'0'.repeat(64)}`;
    expect(verifyStripeSignature(PAYLOAD, withExtra, SECRET, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payments/stripe-verify.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/payments/stripe-verify.ts`

```ts
/**
 * Manual verification of Stripe's `Stripe-Signature` header (t/v1 scheme) —
 * no SDK, same approach as the Svix check in app/api/webhooks/clerk/route.ts.
 * https://docs.stripe.com/webhooks#verify-manually
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v1s = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || v1s.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const expBuf = Buffer.from(expected, 'utf8');
  return v1s.some((v) => {
    const buf = Buffer.from(v, 'utf8');
    return buf.length === expBuf.length && timingSafeEqual(buf, expBuf);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/payments/stripe-verify.test.ts` → PASS. `npx tsc --noEmit` green.

- [ ] **Step 5: Commit**

```bash
git add lib/payments/stripe-verify.ts lib/payments/stripe-verify.test.ts
git commit -m "feat(payments): SDK-free Stripe webhook signature verification"
```

---

### Task 3: Stripe REST client (`lib/payments/stripe.ts`)

**Files:**
- Create: `lib/payments/stripe.ts`
- Test: `lib/payments/stripe.test.ts`

**Interfaces:**
- Consumes: `ResolvedProduct` (Task 1).
- Produces (used by Tasks 6, 7):
  - `stripeConfigured(): boolean`
  - `stripeFormEncode(params: Record<string, string | number | boolean | null | undefined>): string`
  - `createStripeCheckout(input: StripeCheckoutInput): Promise<{ id: string; url: string } | { error: string }>` where `type StripeCheckoutInput = { mode: 'payment' | 'subscription'; product: ResolvedProduct; userDbId: string; checkoutRowId: string; customerEmail: string; locale: 'fr' | 'ht'; successUrl: string; cancelUrl: string }`
  - `getStripeSubscription(id: string): Promise<{ status: string; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean } | null>`

- [ ] **Step 1: Write the failing test** (the encoder is the pure part) — `lib/payments/stripe.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { stripeFormEncode } from '@/lib/payments/stripe';

describe('stripeFormEncode', () => {
  it('encodes bracketed keys and skips null/undefined', () => {
    const s = stripeFormEncode({
      mode: 'payment',
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][unit_amount]': 900,
      skipMe: undefined,
      alsoSkip: null,
    });
    expect(s).toContain('mode=payment');
    expect(s).toContain(encodeURIComponent('line_items[0][quantity]') + '=1');
    expect(s).toContain(encodeURIComponent('line_items[0][price_data][unit_amount]') + '=900');
    expect(s).not.toContain('skipMe');
    expect(s).not.toContain('alsoSkip');
  });

  it('URL-encodes values', () => {
    expect(stripeFormEncode({ name: 'Zouti & kat' })).toBe('name=Zouti+%26+kat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payments/stripe.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/payments/stripe.ts`

```ts
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
  if (input.mode === 'subscription') {
    params['line_items[0][price_data][recurring][interval]'] = 'month';
    params['subscription_data[metadata][userDbId]'] = input.userDbId;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/payments/stripe.test.ts` → PASS. `npx tsc --noEmit` green.

- [ ] **Step 5: Commit**

```bash
git add lib/payments/stripe.ts lib/payments/stripe.test.ts
git commit -m "feat(payments): fetch-based Stripe client (checkout sessions, subscriptions)"
```

---

### Task 4: Event mapper (`lib/payments/stripe-events.ts`)

**Files:**
- Create: `lib/payments/stripe-events.ts`
- Test: `lib/payments/stripe-events.test.ts`

**Interfaces:**
- Produces (used by Tasks 6, 8):

```ts
export type StripeAction =
  | { kind: 'checkout_completed'; eventId: string; sessionId: string;
      mode: 'payment' | 'subscription'; userDbId: string | null;
      checkoutRowId: string | null; productType: 'course' | 'subscription';
      courseSlug: string | null; amountCents: number; currency: string;
      paymentIntentId: string | null; subscriptionId: string | null;
      customerEmail: string | null }
  | { kind: 'invoice_paid'; eventId: string; subscriptionId: string | null;
      paymentIntentId: string | null; amountCents: number; currency: string;
      billingReason: string | null; periodEnd: number | null }
  | { kind: 'invoice_failed'; eventId: string; subscriptionId: string | null;
      amountCents: number; attemptCount: number }
  | { kind: 'charge_refunded'; eventId: string; paymentIntentId: string | null }
  | { kind: 'ignored'; eventId: string; type: string };

export function mapStripeEvent(evt: unknown): StripeAction;
```

- [ ] **Step 1: Write the failing test** — `lib/payments/stripe-events.test.ts`

```ts
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
      subscriptionId: null, customerEmail: 'x@y.com',
    });
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
    }
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payments/stripe-events.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/payments/stripe-events.ts`

```ts
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
      customerEmail: string | null }
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
    };
  }
  if (type === 'invoice.paid') {
    return {
      kind: 'invoice_paid',
      eventId,
      subscriptionId: str(o.subscription),
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
      subscriptionId: str(o.subscription),
      amountCents: num(o.amount_due),
      attemptCount: num(o.attempt_count),
    };
  }
  if (type === 'charge.refunded') {
    return { kind: 'charge_refunded', eventId, paymentIntentId: str(o.payment_intent) };
  }
  return { kind: 'ignored', eventId, type };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/payments/stripe-events.test.ts` → PASS. `npx tsc --noEmit` green.

- [ ] **Step 5: Commit**

```bash
git add lib/payments/stripe-events.ts lib/payments/stripe-events.test.ts
git commit -m "feat(payments): typed Stripe event mapper"
```

---

### Task 5: Receipt email template (`lib/email/templates.ts`)

**Files:**
- Create: `lib/email/templates.ts`
- Test: `lib/email/templates.test.ts`

**Interfaces:**
- Consumes: `toHtg` from `@/lib/money`.
- Produces: `buildReceiptHtml(input: { locale: 'fr' | 'ht'; name: string | null; itemName: string; amountCents: number; dateIso: string; ref: string }): { subject: string; html: string }` — used by Task 6.

- [ ] **Step 1: Write the failing test** — `lib/email/templates.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildReceiptHtml } from '@/lib/email/templates';

describe('buildReceiptHtml', () => {
  const base = { name: 'Jean', itemName: 'Zouti finansye dijital', amountCents: 900, dateIso: '2026-07-22T12:00:00Z', ref: 'pi_123' };

  it('builds a French receipt with USD amount and reference', () => {
    const { subject, html } = buildReceiptHtml({ ...base, locale: 'fr' });
    expect(subject).toContain('Reçu');
    expect(html).toContain('Zouti finansye dijital');
    expect(html).toContain('$9.00');
    expect(html).toContain('pi_123');
    expect(html).toContain('Jean');
  });

  it('builds a Kreyòl receipt', () => {
    const { subject, html } = buildReceiptHtml({ ...base, locale: 'ht' });
    expect(subject).toContain('Resi');
    expect(html).toContain('$9.00');
  });

  it('falls back gracefully without a name', () => {
    const { html } = buildReceiptHtml({ ...base, locale: 'fr', name: null });
    expect(html).toContain('Bonjour,');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/email/templates.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/email/templates.ts`

```ts
/**
 * Bilingual transactional email bodies. Pure functions (no env, no fetch) so
 * they are unit-testable; sending stays in lib/email/resend.ts.
 */
import { toHtg } from '@/lib/money';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function buildReceiptHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  itemName: string;
  amountCents: number;
  dateIso: string;
  ref: string;
}): { subject: string; html: string } {
  const fr = input.locale === 'fr';
  const htg = Math.round(toHtg(input.amountCents / 100)).toLocaleString('fr-FR');
  const date = new Date(input.dateIso).toLocaleDateString(fr ? 'fr-FR' : 'fr-HT');
  const hello = input.name
    ? (fr ? `Bonjour ${input.name},` : `Bonjou ${input.name},`)
    : (fr ? 'Bonjour,' : 'Bonjou,');
  const subject = fr
    ? `Reçu — ${input.itemName} — PNICE Academy`
    : `Resi — ${input.itemName} — PNICE Academy`;
  const lines = fr
    ? { thanks: 'Merci pour ton achat. Voici ton reçu :', item: 'Article', amount: 'Montant', date: 'Date', ref: 'Référence', foot: 'Ton accès est déjà actif dans ton tableau de bord.' }
    : { thanks: 'Mèsi pou acha w la. Men resi w :', item: 'Atik', amount: 'Montan', date: 'Dat', ref: 'Referans', foot: 'Aksè w deja aktif nan tablodbò w.' };
  const html = `
  <div style="font-family:Georgia,serif;background:#EDE6D6;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(16,32,74,.15);border-radius:12px;padding:28px">
      <h1 style="font-size:20px;color:#10204A;margin:0 0 16px">PNICE Academy</h1>
      <p style="color:#2B2B28">${hello}</p>
      <p style="color:#2B2B28">${lines.thanks}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;color:#2B2B28">
        <tr><td style="padding:6px 0;color:#8a8577">${lines.item}</td><td style="text-align:right">${input.itemName}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8577">${lines.amount}</td><td style="text-align:right"><strong>${usd(input.amountCents)}</strong> (~${htg} HTG)</td></tr>
        <tr><td style="padding:6px 0;color:#8a8577">${lines.date}</td><td style="text-align:right">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8577">${lines.ref}</td><td style="text-align:right;font-family:monospace;font-size:12px">${input.ref}</td></tr>
      </table>
      <p style="color:#2B2B28">${lines.foot}</p>
    </div>
  </div>`;
  return { subject, html };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/templates.test.ts` → PASS. `npx tsc --noEmit` green.
Note: `toHtg` reads `NEXT_PUBLIC_USD_TO_HTG`; without it the fallback rate applies — the test only asserts USD, so it is env-independent.

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates.ts lib/email/templates.test.ts
git commit -m "feat(email): bilingual receipt template"
```

---

### Task 6: Fulfillment (`lib/payments/fulfill.ts`)

**Files:**
- Create: `lib/payments/fulfill.ts`

**Interfaces:**
- Consumes: `StripeAction` (Task 4), `getStripeSubscription` (Task 3), `buildReceiptHtml` (Task 5), `sendEmail` from `@/lib/email/resend`, `db` from `@/db`, tables from `@/db/schema`.
- Produces: `fulfillAction(action: StripeAction): Promise<'processed' | 'ignored'>` — throws on hard errors (Task 8's route catches → `failed` webhook log + HTTP 500 so Stripe retries).

No unit test (all DB writes) — verified end-to-end by the Task 11 harness, per the repo's live-DB pattern.

- [ ] **Step 1: Write the implementation** — `lib/payments/fulfill.ts`

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → green (this is the compile-time contract check against `db/schema.ts`).

- [ ] **Step 3: Commit**

```bash
git add lib/payments/fulfill.ts
git commit -m "feat(payments): Stripe fulfillment writes (payments/enrollments/subscriptions)"
```

---

### Task 7: Checkout API route

**Files:**
- Create: `lib/payments/checkout-body.ts`
- Create: `app/api/checkout/route.ts`
- Test: `lib/payments/checkout-body.test.ts`

**Interfaces:**
- Consumes: `resolveProduct` (Task 1), `createStripeCheckout`/`stripeConfigured` (Task 3), `clerkEnabled` from `@/lib/clerk`, Clerk v6 `await auth()` / `await currentUser()`.
- Produces: `POST /api/checkout` accepting JSON `{ productType: 'course' | 'subscription', courseSlug?: string, locale?: 'fr' | 'ht' }`, returning `{ url }` (200) or `{ error }` (400/401/502/503). Used by Task 9's UI. Also `parseCheckoutBody(raw: unknown): CheckoutBody | null` with `type CheckoutBody = { productType: 'course' | 'subscription'; courseSlug: string | null; locale: 'fr' | 'ht' }`.

- [ ] **Step 1: Write the failing test** — `lib/payments/checkout-body.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';

describe('parseCheckoutBody', () => {
  it('accepts a subscription request', () => {
    expect(parseCheckoutBody({ productType: 'subscription', locale: 'fr' }))
      .toEqual({ productType: 'subscription', courseSlug: null, locale: 'fr' });
  });

  it('accepts a course request and defaults locale to ht', () => {
    expect(parseCheckoutBody({ productType: 'course', courseSlug: 'abc' }))
      .toEqual({ productType: 'course', courseSlug: 'abc', locale: 'ht' });
  });

  it('rejects junk', () => {
    expect(parseCheckoutBody(null)).toBeNull();
    expect(parseCheckoutBody({})).toBeNull();
    expect(parseCheckoutBody({ productType: 'course' })).toBeNull();
    expect(parseCheckoutBody({ productType: 'course', courseSlug: '' })).toBeNull();
    expect(parseCheckoutBody({ productType: 'course', courseSlug: 'x'.repeat(101) })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/payments/checkout-body.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement the parser** — `lib/payments/checkout-body.ts`

```ts
export type CheckoutBody = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  locale: 'fr' | 'ht';
};

export function parseCheckoutBody(raw: unknown): CheckoutBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const locale: 'fr' | 'ht' = b.locale === 'fr' ? 'fr' : 'ht';
  if (b.productType === 'subscription')
    return { productType: 'subscription', courseSlug: null, locale };
  if (
    b.productType === 'course' &&
    typeof b.courseSlug === 'string' &&
    b.courseSlug.length > 0 &&
    b.courseSlug.length <= 100
  )
    return { productType: 'course', courseSlug: b.courseSlug, locale };
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/payments/checkout-body.test.ts` → PASS.

- [ ] **Step 5: Implement the route** — `app/api/checkout/route.ts`

```ts
/**
 * POST /api/checkout — creates a Stripe Checkout session for the signed-in
 * user. 503 until Clerk+Stripe+DB are configured (same convention as the
 * Clerk webhook route). Promo codes intentionally NOT applied here until the
 * promo domain is DB-backed (C1-P3) — mock-seeded codes must never discount
 * real charges.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db';
import { users, checkoutSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import { stripeConfigured, createStripeCheckout } from '@/lib/payments/stripe';
import { resolveProduct } from '@/lib/payments/products';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!clerkEnabled || !stripeConfigured() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = parseCheckoutBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const product = resolveProduct(body);
  if (!product) return NextResponse.json({ error: 'unknown_product' }, { status: 400 });

  // Upsert the users row — defensive: the Clerk webhook may not be live yet.
  let row = (await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1))[0];
  if (!row) {
    const cu = await currentUser();
    const email = cu?.emailAddresses?.[0]?.emailAddress;
    if (!email) return NextResponse.json({ error: 'no_email' }, { status: 400 });
    row = (
      await db
        .insert(users)
        .values({
          clerkId,
          email,
          name: [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') || null,
        })
        .onConflictDoUpdate({ target: users.clerkId, set: { email } })
        .returning()
    )[0];
  }

  const cs = (
    await db
      .insert(checkoutSessions)
      .values({
        userId: row.id,
        productType: product.productType,
        courseSlug: product.courseSlug,
        amountCents: product.amountCents,
      })
      .returning({ id: checkoutSessions.id })
  )[0];

  const origin = req.nextUrl.origin;
  const result = await createStripeCheckout({
    mode: product.productType === 'subscription' ? 'subscription' : 'payment',
    product,
    userDbId: row.id,
    checkoutRowId: cs.id,
    customerEmail: row.email,
    locale: body.locale,
    successUrl: `${origin}/${body.locale}/checkout/merci`,
    cancelUrl: `${origin}/${body.locale}/checkout${
      product.courseSlug ? `?course=${product.courseSlug}` : ''
    }`,
  });
  if ('error' in result) {
    console.error('[checkout] stripe error:', result.error);
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
  }
  return NextResponse.json({ url: result.url });
}
```

- [ ] **Step 6: Verify build + unconfigured behavior**

Run: `npx tsc --noEmit` then `npm run build` → route `ƒ /api/checkout` appears, build green.
Then with the dev server (`npm run dev`) and **no STRIPE key in the shell** (temporarily rename it in `.env.local` or run `curl` before keys load): `curl -X POST http://localhost:3000/api/checkout -H "Content-Type: application/json" -d "{}"` → expect `401` (signed out) with keys set, or `503` without. Restore `.env.local`.

- [ ] **Step 7: Commit**

```bash
git add lib/payments/checkout-body.ts lib/payments/checkout-body.test.ts app/api/checkout/route.ts
git commit -m "feat(payments): POST /api/checkout creates Stripe Checkout sessions"
```

---

### Task 8: Stripe webhook route

**Files:**
- Create: `app/api/webhooks/stripe/route.ts`

**Interfaces:**
- Consumes: `verifyStripeSignature` (Task 2), `mapStripeEvent` (Task 4), `fulfillAction` (Task 6), `db` + `webhookLogs`.
- Produces: `POST /api/webhooks/stripe` — 200 processed/ignored/duplicate, 400 bad signature, 500 fulfillment error (Stripe retries), 503 unconfigured. Every non-duplicate delivery writes a `webhook_logs` row (this is what makes the `/admin/sante` webhook table real for Stripe).

- [ ] **Step 1: Write the implementation** — `app/api/webhooks/stripe/route.ts`

```ts
/**
 * Stripe webhook receiver. Mirrors app/api/webhooks/clerk/route.ts conventions:
 * 503 until configured, manual signature check, never logs secrets.
 * Idempotent: a Stripe event id already logged as processed is acked silently.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { verifyStripeSignature } from '@/lib/payments/stripe-verify';
import { mapStripeEvent } from '@/lib/payments/stripe-events';
import { fulfillAction } from '@/lib/payments/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  let evt: unknown;
  try {
    evt = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const action = mapStripeEvent(evt);
  const eventType = (evt as { type?: string }).type ?? 'unknown';

  const dup = await db
    .select({ id: webhookLogs.id })
    .from(webhookLogs)
    .where(and(eq(webhookLogs.providerRef, action.eventId), eq(webhookLogs.status, 'processed')))
    .limit(1);
  if (dup.length > 0) return NextResponse.json({ received: true, duplicate: true });

  try {
    const outcome = action.kind === 'ignored' ? 'ignored' : await fulfillAction(action);
    await db.insert(webhookLogs).values({
      provider: 'stripe',
      eventType,
      payload: evt,
      status: outcome === 'processed' ? 'processed' : 'ignored',
      providerRef: action.eventId,
      processedAt: new Date(),
    });
    return NextResponse.json({ received: true });
  } catch (e) {
    await db.insert(webhookLogs).values({
      provider: 'stripe',
      eventType,
      payload: evt,
      status: 'failed',
      errorMessage: e instanceof Error ? e.message : 'error',
      providerRef: action.eventId,
      processedAt: new Date(),
    });
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build + unconfigured behavior**

Run: `npx tsc --noEmit` and `npm run build` → route `ƒ /api/webhooks/stripe` appears.
`curl -X POST http://localhost:3000/api/webhooks/stripe -d "{}"` without `STRIPE_WEBHOOK_SECRET` set → `503`; with the secret set but no/garbage signature header → `400`.

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "feat(payments): Stripe webhook receiver with idempotency + webhook_logs"
```

---

### Task 9: Wire the checkout UI (card → real payment)

**Files:**
- Modify: `components/checkout/PaymentMethods.tsx` (full replacement below)
- Modify: `app/[locale]/(site)/checkout/page.tsx` (pass 2 props)
- Create: `app/[locale]/(site)/checkout/merci/page.tsx`
- Modify: `messages/fr.json`, `messages/ht.json`

**Interfaces:**
- Consumes: `POST /api/checkout` (Task 7).
- Produces: the card method really pays; other methods keep the "démo" tag (MonCash activates in C1-P2). Success lands on `/{locale}/checkout/merci`.

- [ ] **Step 1: Replace `components/checkout/PaymentMethods.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  IconBrandPaypal,
  IconCreditCard,
  IconDeviceMobile,
  IconCoin,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';

const METHODS = [
  { id: 'paypal', label: 'PayPal', Icon: IconBrandPaypal },
  { id: 'card', label: 'Visa / Mastercard', Icon: IconCreditCard },
  { id: 'moncash', label: 'MonCash', Icon: IconDeviceMobile },
  { id: 'natcash', label: 'NatCash', Icon: IconDeviceMobile },
  { id: 'crypto', label: 'Crypto', Icon: IconCoin },
];

export function PaymentMethods({
  payLabel,
  active,
  productType,
  courseSlug,
}: {
  payLabel: string;
  active?: string[];
  productType: 'course' | 'subscription';
  courseSlug: string | null;
}) {
  const t = useTranslations('checkout');
  const tc = useTranslations('common');
  const locale = useLocale();
  // Providers can be toggled off from the admin platform settings.
  const methods = active ? METHODS.filter((m) => active.includes(m.id)) : METHODS;
  const [selected, setSelected] = useState(methods[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Card is the only live rail in C1-P1 (MonCash lands in C1-P2).
  const isLive = selected === 'card';

  async function pay() {
    if (!isLive || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType, courseSlug, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return; // keep the spinner while the browser navigates
      }
      setError(true);
      setBusy(false);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-ink">{t('methodTitle')}</h2>

      <ul className="mt-5 space-y-2.5">
        {methods.map(({ id, label, Icon }) => {
          const isActive = selected === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setSelected(id)}
                aria-pressed={isActive}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border bg-paper-light p-4 text-left transition-colors',
                  isActive
                    ? 'border-ochre ring-1 ring-ochre'
                    : 'border-ink/15 hover:border-ink/35',
                )}
              >
                <Icon size={22} className="shrink-0 text-ink/70" />
                <span className="flex-1 font-medium text-ink">{label}</span>
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    isActive ? 'border-ochre bg-ochre text-[#1b1207]' : 'border-ink/25',
                  )}
                >
                  {isActive && <IconCheck size={13} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className={buttonClasses('primary', 'lg', 'mt-6 w-full disabled:opacity-60')}
      >
        {busy && <IconLoader2 size={18} className="mr-2 animate-spin" />}
        {busy ? t('redirect') : payLabel}
        {!isLive && !busy && (
          <span className="ml-2 rounded bg-[#1b1207]/15 px-1.5 py-0.5 font-mono text-[10px] uppercase">
            {tc('demo')}
          </span>
        )}
      </button>

      {error && (
        <p className="mt-3 text-center font-mono text-[11px] text-stampred" role="alert">
          {t('payErr')}
        </p>
      )}

      <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-graphite/55">
        {t('demoNote')}
      </p>
    </div>
  );
}
```

Note: if `text-stampred` is not a valid token in `tailwind.config`, use the red token the config actually defines (check `tailwind.config.ts` for the `#B23A2E` color's name) — do not invent a class.

- [ ] **Step 2: Pass the props in `app/[locale]/(site)/checkout/page.tsx`**

Find the `<PaymentMethods` usage and extend it:

```tsx
<PaymentMethods
  payLabel={/* keep the existing payLabel expression exactly as it is */}
  active={/* keep the existing active expression exactly as it is */}
  productType={isSub ? 'subscription' : 'course'}
  courseSlug={course ? course.slug : null}
/>
```

- [ ] **Step 3: Create `app/[locale]/(site)/checkout/merci/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Mèsi — PNICE Academy' };

export default async function MerciPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('merci');
  return (
    <Section>
      <Container className="max-w-2xl text-center">
        <h1 className="font-display text-4xl font-black text-ink md:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-graphite/80">{t('body')}</p>
        <Link
          href={`/${locale}/tableau-de-bord`}
          className={buttonClasses('primary', 'lg', 'mt-8 inline-flex')}
        >
          {t('cta')}
        </Link>
      </Container>
    </Section>
  );
}
```

- [ ] **Step 4: Add i18n keys**

In `messages/fr.json` — inside the existing `"checkout"` object add:

```json
"payErr": "Le paiement n'a pas pu démarrer. Réessaie dans un instant.",
"redirect": "Redirection vers le paiement sécurisé…"
```

and at the top level add:

```json
"merci": {
  "title": "Merci ! Paiement reçu",
  "body": "Ton accès s'active dès que la confirmation arrive (quelques secondes). Retrouve ta formation dans ton tableau de bord.",
  "cta": "Aller au tableau de bord"
}
```

In `messages/ht.json` — inside `"checkout"`:

```json
"payErr": "Peman an pa t ka kòmanse. Eseye ankò talè.",
"redirect": "N ap voye w sou paj peman sekirize a…"
```

top level:

```json
"merci": {
  "title": "Mèsi! Peman an resevwa",
  "body": "Aksè w ap aktive kou konfimasyon an rive (kèk segonn). Ale nan tablodbò w pou w jwenn fòmasyon an.",
  "cta": "Ale nan tablodbò a"
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` and `npm run build` → green, new page `/[locale]/checkout/merci` in the route list. `npm test` still green.

- [ ] **Step 6: Commit**

```bash
git add components/checkout/PaymentMethods.tsx "app/[locale]/(site)/checkout/page.tsx" "app/[locale]/(site)/checkout/merci/page.tsx" messages/fr.json messages/ht.json
git commit -m "feat(checkout): card button starts a real Stripe checkout + merci page"
```

---

### Task 10: Real admin Transactions domain

**Files:**
- Create: `lib/admin/data/real/transactions.ts`
- Modify: `lib/admin/data/real/index.ts`

**Interfaces:**
- Consumes: `payments` + `users` tables, `getCourse` from `@/data/courses`, contract types `TxQuery`/`TxPage`/`TxRow`/`MethodVolume` from `../types` (exact shapes are already defined there — TypeScript enforces conformity).
- Produces: `getTransactions(q: TxQuery): Promise<TxPage>`, `exportTransactions(q: TxQuery): Promise<string>`, `getMethodVolumes(): Promise<MethodVolume[]>` spread into `realDataSource()` — with `ADMIN_DATA_SOURCE=real`, `/admin/transactions` reads Postgres.

**Important:** before writing, open `lib/admin/data/mock/index.ts` and read its `exportTransactions` implementation — mirror its exact return format (CSV columns/headers) so the export route behaves identically. If its signature differs from `Promise<string>`, match the mock (tsc will enforce it). The code below follows the mock's list semantics: page size default 50, `counts` = failed/pending totals ignoring the status filter, `stalePending` = pending older than 24h.

- [ ] **Step 1: Write the implementation** — `lib/admin/data/real/transactions.ts`

```ts
/**
 * Real (Drizzle) Transactions domain — same vocabulary mapping as ./users.ts:
 * DB payments.status 'completed' → UI 'succeeded'; provider 'stripe' → 'card'.
 */
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { payments, users } from '@/db/schema';
import { getCourse } from '@/data/courses';
import type {
  MethodVolume,
  PaymentMethod,
  PaymentStatus,
  TxPage,
  TxQuery,
  TxRow,
} from '../types';

type DbPaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
type DbProvider = 'stripe' | 'paypal' | 'moncash' | 'natcash' | 'crypto';

const statusToUi = (s: DbPaymentStatus): PaymentStatus =>
  s === 'completed' ? 'succeeded' : s;
const uiToDbStatus = (s: PaymentStatus): DbPaymentStatus =>
  s === 'succeeded' ? 'completed' : s;
const providerToMethod = (p: DbProvider): PaymentMethod =>
  p === 'stripe' ? 'card' : p;
const methodToProvider = (m: PaymentMethod): DbProvider =>
  m === 'card' ? 'stripe' : m;

const STALE_MS = 24 * 60 * 60 * 1000;

function toRow(p: typeof payments.$inferSelect, u: { name: string | null; email: string }): TxRow {
  const course = p.courseSlug ? getCourse(p.courseSlug) : undefined;
  const uiStatus = statusToUi(p.status);
  return {
    id: p.id,
    userId: p.userId,
    userName: u.name ?? u.email,
    userEmail: u.email,
    productType: p.productType,
    productCode: course?.code ?? null,
    productTitle_fr: course?.title_fr ?? 'Abonnement mensuel',
    productTitle_ht: course?.title_ht ?? 'Abònman chak mwa',
    method: providerToMethod(p.provider),
    status: uiStatus,
    amountCents: p.amountCents,
    createdAt: p.createdAt.toISOString(),
    stalePending:
      uiStatus === 'pending' && Date.now() - p.createdAt.getTime() > STALE_MS,
  };
}

function buildWhere(q: TxQuery) {
  const conds = [];
  if (q.method) conds.push(eq(payments.provider, methodToProvider(q.method)));
  if (q.status) conds.push(eq(payments.status, uiToDbStatus(q.status)));
  if (q.productType) conds.push(eq(payments.productType, q.productType));
  if (q.from) conds.push(gte(payments.createdAt, new Date(q.from)));
  if (q.to) conds.push(lte(payments.createdAt, new Date(q.to)));
  if (q.segment === 'failed_pending')
    conds.push(or(eq(payments.status, 'failed'), eq(payments.status, 'pending')));
  if (q.search) {
    const term = `%${q.search}%`;
    conds.push(
      or(ilike(users.email, term), ilike(users.name, term), ilike(payments.providerRef, term)),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

export async function getTransactions(q: TxQuery): Promise<TxPage> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = q.pageSize ?? 50;
  const where = buildWhere(q);

  const orderCol = q.sort === 'amount' ? payments.amountCents : payments.createdAt;
  const orderBy = q.dir === 'asc' ? asc(orderCol) : desc(orderCol);

  const rows = await db
    .select({ p: payments, name: users.name, email: users.email })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .where(where);

  const [counts] = await db
    .select({
      all: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${payments.status} = 'pending')::int`,
    })
    .from(payments);

  return {
    rows: rows.map((r) => toRow(r.p, { name: r.name, email: r.email })),
    total,
    page,
    pageSize,
    counts,
  };
}

export async function exportTransactions(q: TxQuery): Promise<string> {
  const { rows } = await getTransactions({ ...q, page: 1, pageSize: 10000 });
  const header = 'id,date,user,email,product,method,status,amount_usd';
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.id,
      r.createdAt,
      esc(r.userName),
      r.userEmail,
      esc(r.productCode ?? r.productTitle_fr),
      r.method,
      r.status,
      (r.amountCents / 100).toFixed(2),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

export async function getMethodVolumes(): Promise<MethodVolume[]> {
  const rows = await db
    .select({
      provider: payments.provider,
      grossCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(eq(payments.status, 'completed'))
    .groupBy(payments.provider);
  return rows.map((r) => ({
    method: providerToMethod(r.provider),
    grossCents: r.grossCents,
    count: r.count,
  }));
}
```

- [ ] **Step 2: Spread into `lib/admin/data/real/index.ts`**

Add the import and three keys (and update the header comment's "Migrated so far" list to include transactions):

```ts
import * as tx from './transactions';
```

inside the returned object, after the USER cluster block:

```ts
    // ── TRANSACTIONS domain (real) ───────────────────────────────────────
    getTransactions: tx.getTransactions,
    exportTransactions: tx.exportTransactions,
    getMethodVolumes: tx.getMethodVolumes,
```

- [ ] **Step 3: Verify against the contract**

Run: `npx tsc --noEmit` — if any signature diverges from `AdminDataSource`, TypeScript fails here; align with the mock's types (the mock is the reference for every method's exact shape).

- [ ] **Step 4: Commit**

```bash
git add lib/admin/data/real/transactions.ts lib/admin/data/real/index.ts
git commit -m "feat(admin): real Drizzle transactions domain (list/export/volumes)"
```

---

### Task 11: Live E2E verification harness + runbook

**Files:**
- Create: `scripts/check-payments.ts`
- Modify: `package.json` (one script)
- Modify: `docs/launch-checklist.md` (step 4)

**Interfaces:**
- Consumes: everything above, a live `DATABASE_URL`, `STRIPE_SECRET_KEY` (test mode), Stripe CLI.
- Produces: `npm run db:check-payments` prints the latest payments/enrollments/subscriptions/webhook_logs so every live test is verifiable from the terminal.

- [ ] **Step 1: Write the harness** — `scripts/check-payments.ts` (same dotenv-first pattern as `scripts/sync-clerk-users.ts`)

```ts
/**
 * Prints the most recent payment-flow rows from the live DB.
 * Usage: npm run db:check-payments
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing in .env.local');
    process.exit(1);
  }
  // Import AFTER dotenv so the db client sees the env (same as sync-clerk-users).
  const { db } = await import('../db');
  const { payments, enrollments, subscriptions, webhookLogs } = await import('../db/schema');
  const { desc } = await import('drizzle-orm');

  const pay = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(10);
  const enr = await db.select().from(enrollments).orderBy(desc(enrollments.purchasedAt)).limit(10);
  const subs = await db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt)).limit(10);
  const hooks = await db.select().from(webhookLogs).orderBy(desc(webhookLogs.receivedAt)).limit(10);

  console.log(`\n── payments (${pay.length}) ──`);
  for (const p of pay)
    console.log(`${p.createdAt.toISOString()}  ${p.status.padEnd(9)} ${p.productType.padEnd(12)} $${(p.amountCents / 100).toFixed(2)}  ${p.courseSlug ?? '—'}  ref=${p.providerRef}`);
  console.log(`\n── enrollments (${enr.length}) ──`);
  for (const e of enr) console.log(`${e.purchasedAt.toISOString()}  ${e.status.padEnd(9)} ${e.courseSlug}`);
  console.log(`\n── subscriptions (${subs.length}) ──`);
  for (const s of subs)
    console.log(`${s.createdAt.toISOString()}  ${s.status.padEnd(9)} period_end=${s.currentPeriodEnd?.toISOString() ?? '—'} ref=${s.providerRef}`);
  console.log(`\n── webhook_logs (${hooks.length}) ──`);
  for (const w of hooks)
    console.log(`${w.receivedAt.toISOString()}  ${w.status.padEnd(9)} ${w.provider}:${w.eventType} ${w.errorMessage ?? ''}`);
}

main().then(() => process.exit(0));
```

- [ ] **Step 2: Add the npm script** — in `package.json` scripts, after `"db:sync-clerk"`:

```json
"db:check-payments": "tsx scripts/check-payments.ts"
```

- [ ] **Step 3: Live E2E run (Stripe test mode)** — execute and record results:

1. Install the Stripe CLI if absent (https://stripe.com/docs/stripe-cli), `stripe login`.
2. `stripe listen --forward-to localhost:3000/api/webhooks/stripe` → copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` in `.env.local`. Leave it running.
3. `npm run dev`, sign in, open `/ht/checkout?course=zouti-finansye-dijital`, choose **Visa / Mastercard**, pay with card `4242 4242 4242 4242` (any future date/CVC).
4. Expect: redirect to `/ht/checkout/merci`; the `stripe listen` terminal shows `checkout.session.completed → 200`.
5. `npm run db:check-payments` → expect 1 completed course payment + 1 active enrollment + processed webhook logs.
6. Repeat from `/ht/checkout` (no `?course=`) for the **subscription** → expect a subscriptions row with `period_end` ~1 month out.
7. In the Stripe test dashboard, refund the course payment → expect `charge.refunded → 200`, payment `refunded`, enrollment `refunded` in the harness output.
8. With `ADMIN_DATA_SOURCE=real` in `.env.local`, open `/ht/admin/transactions` → the real rows appear.

- [ ] **Step 4: Update `docs/launch-checklist.md`** — replace item 4's text ("Payment rail #1 — Stripe…") body with:

```markdown
4. **Payment rail #1 — Stripe (test mode first). ✔ IMPLEMENTED (C1-P1).**
   Checkout: `POST /api/checkout` → Stripe Checkout (one-off + $79 subscription).
   Webhook: `/api/webhooks/stripe` (idempotent, signature-verified) → `payments`,
   `enrollments`, `subscriptions`, `webhook_logs`, admin notification, receipt
   email. Verify any deployment with `npm run db:check-payments` + the runbook in
   `docs/superpowers/plans/2026-07-22-c1p1-stripe-payments.md` (Task 11).
   Go-live still needs the PROD webhook endpoint secret (`STRIPE_WEBHOOK_SECRET`).
```

- [ ] **Step 5: Final gate**

Run: `npm test` (all suites), `npx tsc --noEmit`, `npm run build` → all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-payments.ts package.json docs/launch-checklist.md
git commit -m "feat(payments): live E2E harness + runbook; launch checklist updated"
```

---

## Self-Review (done at plan-writing time)

- **Spec coverage (C1 scope of this sub-plan):** checkout serveur ✔ (T7), webhook + écritures ✔ (T6/T8), Billing récurrent + dunning signal ✔ (T3/T6 invoice_paid/failed; real dunning *emails* stay with the existing admin dunning action — full real dunning automation belongs to C1-P3's subscriptions domain), reçu email ✔ (T5/T6), admin transactions réel ✔ (T10), vérification E2E ✔ (T11). MonCash → C1-P2; promos réelles → C1-P3 (stated, deliberate).
- **Placeholders:** none — every step has complete code/commands.
- **Type consistency:** `ResolvedProduct`, `StripeAction`, `CheckoutBody`, harness column names all defined once and reused; DB columns verified against `db/schema.ts` (payments/enrollments/subscriptions/checkoutSessions/adminNotifications/webhookLogs).
- **Known execution checks for the implementer:** confirm the mock's `exportTransactions` CSV format (T10 note), confirm the tailwind red token name (T9 note), Clerk v6 `auth()` is async (used with `await`).
