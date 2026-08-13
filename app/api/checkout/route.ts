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
 *   - PENDING-CHECKOUT GUARD (launch review fix): the repurchase guard above
 *     only reads enrollments/subscriptions — rows only written by the
 *     webhook, AFTER Stripe redirects the buyer, so it alone can't stop two
 *     tabs / a retried POST / a slow webhook from minting TWO live Stripe
 *     sessions for the same item first. Before creating a new session, this
 *     route looks for the user's own most recent not-yet-completed
 *     `checkout_sessions` row for the SAME product and asks Stripe directly
 *     whether it's still live (lib/payments/checkout-guard.ts's pure
 *     decision + lib/payments/stripe.ts's `getStripeCheckoutSessionStatus`)
 *     — still open ⇒ hand back that SAME session instead of a second one;
 *     already paid (webhook not landed yet) ⇒ refuse rather than charge
 *     twice; expired/unknown ⇒ proceed exactly as before this fix.
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
import { and, desc, eq, gte, isNull, isNotNull } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import { stripeConfigured, createStripeCheckout, getStripeCheckoutSessionStatus } from '@/lib/payments/stripe';
import { resolveProduct } from '@/lib/payments/products';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';
import { hasCourseAccess, hasSubscriptionConflict } from '@/lib/learner/access';
import { validatePromo } from '@/lib/admin/data';
import { applyPromo } from '@/lib/payments/promo';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { decidePendingCheckout } from '@/lib/payments/checkout-guard';
import { isMoncashRef } from '@/lib/payments/moncash-order';

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
  let discountCents = 0;
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
      // Stage 1 fix — see lib/admin/data/types.ts's `validatePromo` doc
      // comment: this is the SERVER-AUTHORITATIVE resolution (never trusts
      // anything the client sent), so a promo can never be tricked into
      // discounting a named teacher's own subscription plan.
      productKind: product.kind,
    });
    const applied = applyPromo(product.amountCents, validation);
    if (!applied.ok) {
      return NextResponse.json({ error: 'promo_invalid', reason: applied.reason }, { status: 400 });
    }
    amountCents = applied.amountCents;
    discountCents = applied.discountCents;
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

  // Pending-checkout guard (launch review fix) — see file header. Bounded to
  // the last 24h (Stripe's own default Checkout Session TTL): an older row
  // can only resolve to 'expired' below anyway, so this just avoids a wasted
  // Stripe round-trip for ancient/abandoned carts. NOT filtered on
  // `abandonedAt` — the abandoned-cart cron flags a row at 2h purely for
  // relance email purposes, well before Stripe's own session actually
  // expires, so an "abandoned" row can still be a live, payable session.
  // Known coarseness: `checkout_sessions` carries no `teacherPlanId`, so a
  // pending PLATFORM subscription checkout and a pending TEACHER subscription
  // checkout are indistinguishable here (both have `courseSlug: null`) — a
  // user who starts subscribing to teacher A then immediately tries teacher
  // B before finishing gets A's session handed back, not a new one for B.
  // Never a double charge either way (the whole point of this guard); worst
  // case is "wrong pending checkout resumed", recoverable by cancelling it.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pendingRow = (
    await db
      .select({ sessionId: checkoutSessions.sessionId })
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.userId, row.id),
          eq(checkoutSessions.productType, product.productType),
          product.courseSlug ? eq(checkoutSessions.courseSlug, product.courseSlug) : isNull(checkoutSessions.courseSlug),
          isNull(checkoutSessions.completedAt),
          isNotNull(checkoutSessions.sessionId),
          gte(checkoutSessions.startedAt, oneDayAgo),
        ),
      )
      .orderBy(desc(checkoutSessions.startedAt))
      .limit(1)
  )[0];
  // A MonCash order also lives in `checkout_sessions`, but its `sessionId` is
  // a locale marker (`moncash:ht`), never a Stripe id — asking Stripe about it
  // would burn a round trip to be told "no such session". Skipping it is also
  // correct behaviour, not just an optimisation: an abandoned MonCash attempt
  // must not block, or be "resumed" as, a card checkout.
  const pendingStatus =
    pendingRow?.sessionId && !isMoncashRef(pendingRow.sessionId)
      ? await getStripeCheckoutSessionStatus(pendingRow.sessionId)
      : null;
  const decision = decidePendingCheckout(pendingStatus);
  if (decision.action === 'block') {
    return NextResponse.json({ error: 'checkout_processing' }, { status: 409 });
  }
  if (decision.action === 'reuse') {
    return NextResponse.json({ url: decision.url });
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
    // `product` is passed UNCHANGED (full gross) — launch review fix:
    // baking a promo discount straight into a subscription's recurring
    // unit_amount used to discount EVERY renewal forever. `discountCents`
    // below is what the buyer actually saw and accepted on the page; for a
    // subscription lib/payments/stripe.ts applies it as a one-time coupon
    // instead so only the first invoice is discounted.
    product,
    discountCents,
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
