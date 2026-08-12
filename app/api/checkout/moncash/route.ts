/**
 * POST /api/checkout/moncash — start a MonCash payment for the signed-in user.
 *
 * MonCash's Merchant API pushes a cash-out request straight to the buyer's
 * handset, so unlike the Stripe route this one takes a PHONE NUMBER and hands
 * back nothing to redirect to: the buyer stays here, approves on their phone,
 * and the page polls `/api/payments/moncash/status` until it clears.
 *
 * Everything else mirrors /api/checkout on purpose (rate limit, auth, product
 * resolution, repurchase refusal, users upsert, checkout_sessions row) so the
 * two rails can't drift into different rules about who may be charged. What
 * differs is forced by MonCash itself:
 *
 *   - COURSES ONLY. MonCash has no recurring-payment concept, so a
 *     subscription started here could never renew. Refused outright rather
 *     than sold as something it isn't.
 *   - CHARGED IN GOURDES, converted at the live admin rate (lib/fx.ts) at this
 *     moment. The gourde figure is returned so the page can state exactly what
 *     will leave the buyer's wallet before they approve.
 *   - NO PROMO CODES YET. The discount plumbing exists for Stripe; threading
 *     it through the gourde conversion needs its own pass, so a code is
 *     refused here rather than silently ignored at full price.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db';
import { users, checkoutSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import {
  initiateMoncashPayment,
  normalizeHaitianMsisdn,
  usdCentsToHtg,
} from '@/lib/payments/moncash';
import { moncashSellable } from '@/lib/payments/providers';
import { encodeMoncashRef } from '@/lib/payments/moncash-order';
import { resolveProduct } from '@/lib/payments/products';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';
import { hasCourseAccess } from '@/lib/learner/access';
import { getFxRate } from '@/lib/fx';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!clerkEnabled || !moncashSellable() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!rateLimit('checkout', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const body = parseCheckoutBody(raw);
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (body.promoCode) return NextResponse.json({ error: 'promo_unsupported' }, { status: 400 });

  // The buyer's own MonCash number — normalised here so every downstream call
  // sees the exact `509XXXXXXXX` shape MonCash expects, and so a mistyped
  // number is refused now rather than becoming a prompt that never arrives.
  const account = normalizeHaitianMsisdn(String(raw?.phone ?? ''));
  if (!account) return NextResponse.json({ error: 'bad_phone' }, { status: 400 });

  const product = await resolveProduct(body);
  if (!product) return NextResponse.json({ error: 'unknown_product' }, { status: 400 });
  if (product.productType !== 'course' || !product.courseSlug) {
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

  // The order row IS the MonCash `reference` — the status endpoint and both
  // Digicel callbacks resolve the buyer, the course and the USD price from it.
  // `sessionId` carries the locale (see encodeMoncashRef) because MonCash's
  // callback URLs are fixed and stateless.
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

  const started = await initiateMoncashPayment({
    reference: order.id,
    account,
    amountHtg,
  });
  if (!started.ok) {
    console.error('[checkout/moncash] initiate failed:', started.message);
    return NextResponse.json({ error: 'moncash_error' }, { status: 502 });
  }

  // No `url`: nothing to redirect to. The client shows "check your phone" and
  // polls the status endpoint with this orderId.
  return NextResponse.json({ orderId: order.id, amountHtg, account });
}
