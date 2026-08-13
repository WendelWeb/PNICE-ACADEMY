/**
 * POST /api/checkout/moncash — start a MonCash payment for the signed-in user.
 *
 * Mirrors /api/checkout's guards deliberately (rate limit, auth, product
 * resolution, repurchase refusal, users upsert, checkout_sessions row) so the
 * two rails cannot drift into different rules about who may be charged. What
 * differs is forced by MonCash itself:
 *
 *   - COURSES ONLY. MonCash has no recurring-payment concept, so a
 *     subscription started here could never renew. Refused outright rather
 *     than sold as something it isn't.
 *   - CHARGED IN GOURDES. Prices are USD cents; the charge is converted at the
 *     live admin-set rate (lib/fx.ts) at this moment, and that gourde figure
 *     is what the buyer commits to. It is returned to the client so the
 *     confirmation can show the real amount before the redirect.
 *   - NO PROMO CODES YET. The discounted-amount plumbing exists for Stripe;
 *     wiring it through the gourde conversion needs its own pass, so a code is
 *     refused here instead of being silently ignored at full price.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db';
import { users, checkoutSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import { moncashConfigured, createMoncashOrder, usdCentsToHtg } from '@/lib/payments/moncash';
import { encodeMoncashRef } from '@/lib/payments/moncash-order';
import { resolveProduct } from '@/lib/payments/products';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';
import { hasCourseAccess } from '@/lib/learner/access';
import { getFxRate } from '@/lib/fx';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { checkoutProviders } from '@/lib/payments/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!clerkEnabled || !moncashConfigured() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!rateLimit('checkout', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // The SAME rule the selector renders from — checked here too, because a
  // page gate is not a security boundary. In sandbox-on-production this
  // resolves to owner-only, so a visitor who hand-crafts this POST is refused
  // even though the page never showed them the option.
  if (!(await checkoutProviders()).includes('moncash')) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const body = parseCheckoutBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (body.promoCode) return NextResponse.json({ error: 'promo_unsupported' }, { status: 400 });

  const product = await resolveProduct(body);
  if (!product) return NextResponse.json({ error: 'unknown_product' }, { status: 400 });
  if (product.productType !== 'course' || !product.courseSlug) {
    // Subscriptions cannot renew on MonCash — see the file header.
    return NextResponse.json({ error: 'subscription_unsupported' }, { status: 400 });
  }

  // Repurchase guard — gated + never-throw, exactly as on the Stripe route.
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
    console.error('[checkout/moncash] refusing a zero-gourde charge', { rate, cents: product.amountCents });
    return NextResponse.json({ error: 'bad_amount' }, { status: 400 });
  }

  // The order row IS the MonCash orderId — both callbacks resolve the buyer,
  // the course and the USD price from it. `sessionId` carries the locale (see
  // encodeMoncashRef) because MonCash's callback URLs are fixed and stateless.
  const order = (
    await db
      .insert(checkoutSessions)
      .values({
        userId: row.id,
        productType: 'course',
        courseSlug: product.courseSlug,
        amountCents: product.amountCents,
        sessionId: encodeMoncashRef(body.locale === 'fr' ? 'fr' : 'ht'),
      })
      .returning({ id: checkoutSessions.id })
  )[0];

  const locale = body.locale === 'fr' ? 'fr' : 'ht';
  const origin = req.nextUrl.origin;

  const created = await createMoncashOrder({
    orderId: order.id,
    amountHtg,
    description: product.courseSlug,
    // Bazik takes these per request; Digicel ignores them (its URLs are fixed
    // in the merchant portal). Sending them always keeps this call site free
    // of provider knowledge — and gives Bazik buyers a return that already
    // knows the order and the language.
    successUrl: `${origin}/api/payments/moncash/retour?orderId=${encodeURIComponent(order.id)}`,
    errorUrl: `${origin}/${locale}/checkout?course=${encodeURIComponent(product.courseSlug)}`,
    webhookUrl: `${origin}/api/webhooks/moncash?orderId=${encodeURIComponent(order.id)}`,
  });
  if (!created.ok) {
    console.error('[checkout/moncash] create failed:', created.message);
    // Provider outages are the failure this rail sees most (Digicel's sandbox
    // has stopped answering CreatePayment mid-session while OAuth kept
    // working). Separating "MonCash is not answering" from every other error
    // matters: the buyer's own action is different — wait and retry, or pay by
    // card — and a generic failure would just invite a pointless retry loop.
    const unreachable = created.message === 'timeout' || created.message.startsWith('HTTP 5');
    return NextResponse.json(
      { error: unreachable ? 'moncash_unreachable' : 'moncash_error' },
      { status: 502 },
    );
  }

  // Persist the PROVIDER's reference. For Digicel it is our own order id, but
  // Bazik mints its own and only answers to that — without this, a Bazik
  // payment could never be verified and the buyer would never get access.
  await db
    .update(checkoutSessions)
    .set({ sessionId: encodeMoncashRef(locale, created.providerRef) })
    .where(eq(checkoutSessions.id, order.id));

  return NextResponse.json({ url: created.redirectUrl, amountHtg, orderId: order.id });
}
