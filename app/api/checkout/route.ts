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
  await db.update(checkoutSessions).set({ sessionId: result.id }).where(eq(checkoutSessions.id, cs.id));
  return NextResponse.json({ url: result.url });
}
