/**
 * POST /api/checkout/natcash — start a NatCash payment for the signed-in user.
 *
 * Mirrors /api/checkout/moncash guard for guard (rate limit, auth, product
 * resolution, repurchase refusal, users upsert, checkout_sessions row) so the
 * two mobile-money rails cannot drift into different rules about who may be
 * charged. What differs is only what NatCash itself forces:
 *
 *   - COURSES ONLY. No recurring-payment concept, so a subscription started
 *     here could never renew. Refused rather than sold as something it isn't.
 *   - CHARGED IN GOURDES, converted at the live admin-set rate (lib/fx.ts) at
 *     this moment — the same `usdCentsToHtg` the checkout page displays, so
 *     the summary and the debit are the same number by construction.
 *   - NO PROMO CODES YET, same as MonCash: refused outright instead of being
 *     silently ignored at full price.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db';
import { users, checkoutSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import { natcashConfigured, createNatcashOrder, usdCentsToHtg, HTG_WALLET_MAX } from '@/lib/payments/natcash';
import { encodeNatcashRef } from '@/lib/payments/natcash-order';
import { resolveProduct } from '@/lib/payments/products';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';
import { hasCourseAccess } from '@/lib/learner/access';
import { getFxRate } from '@/lib/fx';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { checkoutProviders } from '@/lib/payments/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!clerkEnabled || !natcashConfigured() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!rateLimit('checkout', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // The SAME rule the selector renders from — checked here too, because a page
  // gate is not a security boundary.
  if (!(await checkoutProviders()).includes('natcash')) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const body = parseCheckoutBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (body.promoCode) return NextResponse.json({ error: 'promo_unsupported' }, { status: 400 });

  const product = await resolveProduct(body);
  if (!product) return NextResponse.json({ error: 'unknown_product' }, { status: 400 });
  if (product.productType !== 'course' || !product.courseSlug) {
    return NextResponse.json({ error: 'subscription_unsupported' }, { status: 400 });
  }

  if (await hasCourseAccess(clerkId, product.courseSlug)) {
    return NextResponse.json({ error: 'already_owned' }, { status: 409 });
  }

  // Upsert the users row (the Clerk webhook may not have landed yet).
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

  const rate = await getFxRate();
  const amountHtg = usdCentsToHtg(product.amountCents, rate);
  if (amountHtg <= 0) {
    console.error('[checkout/natcash] refusing a zero-gourde charge', { rate, cents: product.amountCents });
    return NextResponse.json({ error: 'bad_amount' }, { status: 400 });
  }
  if (amountHtg > HTG_WALLET_MAX) {
    console.error('[checkout/natcash] refusing a charge above the wallet limit', { amountHtg, rate });
    return NextResponse.json({ error: 'amount_too_large' }, { status: 400 });
  }

  const locale = body.locale === 'fr' ? 'fr' : 'ht';
  const order = (
    await db
      .insert(checkoutSessions)
      .values({
        userId: row.id,
        productType: 'course',
        courseSlug: product.courseSlug,
        amountCents: product.amountCents,
        sessionId: encodeNatcashRef(locale),
      })
      .returning({ id: checkoutSessions.id })
  )[0];

  const origin = req.nextUrl.origin;
  const created = await createNatcashOrder({
    orderId: order.id,
    amountHtg,
    description: product.courseSlug,
    successUrl: `${origin}/api/payments/natcash/retour?orderId=${encodeURIComponent(order.id)}`,
    errorUrl: `${origin}/${locale}/checkout?course=${encodeURIComponent(product.courseSlug)}`,
    webhookUrl: `${origin}/api/webhooks/natcash`,
  });
  if (!created.ok) {
    console.error('[checkout/natcash] create failed:', created.message);
    // Gateway outages are the failure this rail will see most. Separating
    // "NatCash is not answering" from every other error matters because the
    // buyer's own next action differs — wait, or pay another way.
    const unreachable =
      created.message === 'timeout' || created.message === 'network' || /^HTTP 5\d\d/.test(created.message);
    return NextResponse.json(
      { error: unreachable ? 'natcash_unreachable' : 'natcash_error' },
      { status: 502 },
    );
  }

  // Persist Kobara's own payment id: it is not derivable from our order id,
  // and without it neither the return page nor any later check can ask about
  // this payment at all.
  await db
    .update(checkoutSessions)
    .set({ sessionId: encodeNatcashRef(locale, created.providerRef) })
    .where(eq(checkoutSessions.id, order.id));

  return NextResponse.json({ url: created.redirectUrl, amountHtg, orderId: order.id });
}
