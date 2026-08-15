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
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db, isMissingColumnError } from '@/db';
import { users, checkoutSessions } from '@/db/schema';
import { checkoutSessionsPre0021 } from '@/db/checkout-compat';
import { eq, inArray } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import { natcashConfigured, createNatcashOrder, usdCentsToHtg, HTG_WALLET_MAX } from '@/lib/payments/natcash';
import { encodeNatcashRef } from '@/lib/payments/natcash-order';
import { resolveProduct, type ResolvedProduct } from '@/lib/payments/products';
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

  if (body.productType !== 'course' || body.courseSlugs.length === 0) {
    return NextResponse.json({ error: 'subscription_unsupported' }, { status: 400 });
  }

  // Basket of ≥1, mirroring /api/checkout/moncash exactly — see that route
  // for the reasoning on refusing whole baskets over one bad slug.
  const products: ResolvedProduct[] = [];
  for (const slug of body.courseSlugs) {
    const product = await resolveProduct({ productType: 'course', courseSlug: slug });
    if (!product || product.productType !== 'course' || !product.courseSlug) {
      return NextResponse.json({ error: 'unknown_product', courseSlug: slug }, { status: 400 });
    }
    products.push(product);
  }

  for (const product of products) {
    if (await hasCourseAccess(clerkId, product.courseSlug!)) {
      return NextResponse.json({ error: 'already_owned', courseSlug: product.courseSlug }, { status: 409 });
    }
    // Same rule as the MonCash route: a free course never enters a wallet
    // charge — /api/enroll/free is its path.
    if (product.amountCents === 0) {
      return NextResponse.json({ error: 'free_course', courseSlug: product.courseSlug }, { status: 400 });
    }
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
  const totalCents = products.reduce((a, p) => a + p.amountCents, 0);
  // PRICE-CHANGED GUARD — same as /api/checkout/moncash: never debit a
  // figure the buyer didn't see.
  if (body.expectedTotalCents !== null && body.expectedTotalCents !== totalCents) {
    return NextResponse.json({ error: 'price_changed', totalCents }, { status: 409 });
  }
  // One conversion of the basket TOTAL — see /api/checkout/moncash.
  const amountHtg = usdCentsToHtg(totalCents, rate);
  if (amountHtg <= 0) {
    console.error('[checkout/natcash] refusing a zero-gourde charge', { rate, cents: totalCents });
    return NextResponse.json({ error: 'bad_amount' }, { status: 400 });
  }
  if (amountHtg > HTG_WALLET_MAX) {
    console.error('[checkout/natcash] refusing a charge above the wallet limit', { amountHtg, rate });
    return NextResponse.json({ error: 'amount_too_large' }, { status: 400 });
  }

  const locale = body.locale === 'fr' ? 'fr' : 'ht';

  // One row per course; a basket's rows share a cartId which becomes the
  // gateway orderId — the mirror of /api/checkout/moncash, same fallback
  // when the live DB still lags migration 0021.
  const cartId = products.length > 1 ? randomUUID() : null;
  let orderId: string;
  let rowIds: string[];
  try {
    const inserted = await db
      .insert(checkoutSessions)
      .values(
        products.map((p) => ({
          userId: row.id,
          productType: 'course' as const,
          courseSlug: p.courseSlug,
          amountCents: p.amountCents,
          sessionId: encodeNatcashRef(locale),
          cartId,
        })),
      )
      .returning({ id: checkoutSessions.id });
    rowIds = inserted.map((r) => r.id);
    orderId = cartId ?? rowIds[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    // Pre-0021 DB — same two honest outcomes as /api/checkout/moncash: a
    // basket refuses (unlinked rows would strand the buyer's money), a
    // single purchase retries via the twin table and keeps working.
    if (cartId) {
      console.error('[checkout/natcash] cart refused — checkout_sessions.cart_id missing, run `npm run db:push`.');
      return NextResponse.json({ error: 'cart_unavailable' }, { status: 503 });
    }
    console.warn('[checkout/natcash] insert fell back to pre-0021 columns — run `npm run db:push`.');
    const inserted = await db
      .insert(checkoutSessionsPre0021)
      .values({
        userId: row.id,
        productType: 'course',
        courseSlug: products[0].courseSlug,
        amountCents: products[0].amountCents,
        sessionId: encodeNatcashRef(locale),
      })
      .returning({ id: checkoutSessionsPre0021.id });
    rowIds = inserted.map((r) => r.id);
    orderId = rowIds[0];
  }

  const origin = req.nextUrl.origin;
  const created = await createNatcashOrder({
    orderId,
    amountHtg,
    description:
      products.length === 1 ? products[0].courseSlug! : `PNICE Academy — ${products.length} kou`,
    successUrl: `${origin}/api/payments/natcash/retour?orderId=${encodeURIComponent(orderId)}`,
    errorUrl:
      products.length === 1
        ? `${origin}/${locale}/checkout?course=${encodeURIComponent(products[0].courseSlug!)}`
        : `${origin}/${locale}/panye`,
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

  // Persist Kobara's own payment id — on EVERY row of the basket, so any
  // single row can be recovered on its own. It is not derivable from our
  // order id, and without it neither the return page nor any later check
  // can ask about this payment at all.
  await db
    .update(checkoutSessions)
    .set({ sessionId: encodeNatcashRef(locale, created.providerRef) })
    .where(inArray(checkoutSessions.id, rowIds));

  return NextResponse.json({ url: created.redirectUrl, amountHtg, orderId });
}
