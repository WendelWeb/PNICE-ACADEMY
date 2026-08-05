/**
 * POST /api/checkout — creates a Stripe Checkout session for the signed-in
 * user. 503 until Clerk+Stripe+DB are configured (same convention as the
 * Clerk webhook route).
 *
 * Stage: checkout honesty —
 *   - REPURCHASE GUARD: refuses (409) to charge for a course the user
 *     already has access to, or a subscription an active one already covers
 *     (lib/learner/access.ts) — the page shows a friendly state first; this
 *     is the server-side backstop so nobody can ever be charged twice.
 *   - PROMO CODES ARE REAL: the submitted code is re-validated here with the
 *     SAME `validatePromo` the checkout field's preview uses, and the Stripe
 *     session is created at the DISCOUNTED unit_amount
 *     (lib/payments/promo.ts). An invalid/expired code at pay time is a
 *     clear 400, never a silent full charge. Discounts only apply when the
 *     promo store is the real DB (`ADMIN_DATA_SOURCE=real`) — mock-seeded
 *     codes must never discount real charges (the original guard, upheld).
 *   - RATE-LIMITED per IP (Stage 8 — launch hygiene): lib/rate-limit.ts's
 *     shared in-memory sliding window, bucket 'checkout' — a caller past the
 *     window gets a plain 429, never a Stripe call. Same honest per-instance
 *     limitation documented there.
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
import { hasCourseAccess, hasSubscriptionConflict } from '@/lib/learner/access';
import { validatePromo } from '@/lib/admin/data';
import { applyPromo } from '@/lib/payments/promo';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!clerkEnabled || !stripeConfigured() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!rateLimit('checkout', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = parseCheckoutBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const product = await resolveProduct(body);
  if (!product) return NextResponse.json({ error: 'unknown_product' }, { status: 400 });

  // Repurchase guard (server-side backstop — the page already shows a
  // friendly "Ou gen aksè deja" state; this refusal covers stale tabs, raced
  // requests and hand-crafted POSTs). Both checks are GATED + NEVER-THROW,
  // resolving to false on any failure — a broken guard degrades to today's
  // behaviour, never to a blocked legitimate purchase.
  if (product.productType === 'course' && product.courseSlug) {
    if (await hasCourseAccess(clerkId, product.courseSlug)) {
      return NextResponse.json({ error: 'already_owned' }, { status: 409 });
    }
  } else if (product.productType === 'subscription') {
    const conflict = await hasSubscriptionConflict(clerkId, {
      kind: product.kind ?? 'platform',
      teacherPlanId: product.teacherPlanId,
      teacherUserId: product.teacherUserId,
    });
    if (conflict) return NextResponse.json({ error: 'already_owned' }, { status: 409 });
  }

  // Promo code — validated against the server-resolved gross, never client
  // numbers. Any code that no longer applies is a CLEAR refusal (the client
  // surfaces the exact reason); silently charging full price is the bug this
  // stage removes.
  let amountCents = product.amountCents;
  let promoCode: string | null = null;
  if (body.promoCode) {
    if (process.env.ADMIN_DATA_SOURCE !== 'real') {
      // The promo store is the in-memory mock — its seeded codes must never
      // discount a real Stripe charge. Refuse rather than ignore.
      return NextResponse.json({ error: 'promo_invalid', reason: 'not_found' }, { status: 400 });
    }
    const validation = await validatePromo({
      code: body.promoCode,
      productType: product.productType,
      courseSlug: product.courseSlug,
      grossCents: product.amountCents,
    });
    const applied = applyPromo(product.amountCents, validation);
    if (!applied.ok) {
      return NextResponse.json({ error: 'promo_invalid', reason: applied.reason }, { status: 400 });
    }
    amountCents = applied.amountCents;
    promoCode = validation.code;
  }

  // Upsert the users row — defensive: the Clerk webhook may not be live yet.
  let row = (await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1))[0];
  if (!row) {
    const cu = await currentUser();
    const primary = cu?.emailAddresses?.find((e) => e.id === cu?.primaryEmailAddressId);
    const email = primary?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress;
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
        // The amount actually charged (post-promo) — cart/abandon reporting
        // must reflect real money, not the undiscounted list price.
        amountCents,
      })
      .returning({ id: checkoutSessions.id })
  )[0];

  const origin = req.nextUrl.origin;
  const result = await createStripeCheckout({
    mode: product.productType === 'subscription' ? 'subscription' : 'payment',
    // The discounted amount IS the session amount — for a subscription this
    // is the recurring monthly price the buyer saw and accepted on the page.
    product: { ...product, amountCents },
    promoCode,
    userDbId: row.id,
    checkoutRowId: cs.id,
    customerEmail: row.email,
    locale: body.locale,
    // {CHECKOUT_SESSION_ID} is substituted by Stripe at redirect time — the
    // merci page reads it back (server-side, env-gated) to show what was
    // really bought instead of a generic screen (Stage: checkout honesty).
    successUrl: `${origin}/${body.locale}/checkout/merci?session_id={CHECKOUT_SESSION_ID}`,
    // Task: per-teacher subscription checkout — a cancelled per-teacher plan
    // purchase must return to THAT teacher's checkout summary, not silently
    // fall back to the platform-default subscription page.
    cancelUrl: `${origin}/${body.locale}/checkout${
      product.courseSlug
        ? `?course=${product.courseSlug}`
        : body.teacherSlug
          ? `?teacher=${encodeURIComponent(body.teacherSlug)}`
          : ''
    }`,
  });
  if ('error' in result) {
    console.error('[checkout] stripe error:', result.error);
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
  }
  await db.update(checkoutSessions).set({ sessionId: result.id }).where(eq(checkoutSessions.id, cs.id));
  return NextResponse.json({ url: result.url });
}
