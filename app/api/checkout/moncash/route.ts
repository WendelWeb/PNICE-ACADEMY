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
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db, isMissingColumnError } from '@/db';
import { users, checkoutSessions } from '@/db/schema';
import { checkoutSessionsPre0021 } from '@/db/checkout-compat';
import { eq, inArray } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import { moncashConfigured, createMoncashOrder, usdCentsToHtg, MONCASH_MAX_HTG } from '@/lib/payments/moncash';
import { encodeMoncashRef } from '@/lib/payments/moncash-order';
import { resolveProduct, type ResolvedProduct } from '@/lib/payments/products';
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
  if (body.productType !== 'course' || body.courseSlugs.length === 0) {
    // Subscriptions cannot renew on MonCash — see the file header.
    return NextResponse.json({ error: 'subscription_unsupported' }, { status: 400 });
  }

  // EVERY course purchase is a basket of ≥1 (« panye » — the single-item
  // checkout is just a basket of one, so nothing below forks on shape).
  // Every slug must resolve to a real, published, sellable course; one
  // unknown slug refuses the whole basket rather than silently charging for
  // less than the buyer thinks they are buying.
  const products: ResolvedProduct[] = [];
  for (const slug of body.courseSlugs) {
    const product = await resolveProduct({ productType: 'course', courseSlug: slug });
    if (!product || product.productType !== 'course' || !product.courseSlug) {
      return NextResponse.json({ error: 'unknown_product', courseSlug: slug }, { status: 400 });
    }
    products.push(product);
  }

  // Repurchase guard — gated + never-throw, exactly as on the Stripe route.
  // Names WHICH course is already owned so the cart page can drop that one
  // item and retry, instead of a dead-end generic refusal.
  for (const product of products) {
    if (await hasCourseAccess(clerkId, product.courseSlug!)) {
      return NextResponse.json({ error: 'already_owned', courseSlug: product.courseSlug }, { status: 409 });
    }
    // An explicitly-FREE course (pricing-rules.ts) has nothing to charge —
    // it enrols via /api/enroll/free, never through a wallet. Named so the
    // cart page can drop that one line and retry with the rest.
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
  // PRICE-CHANGED GUARD: the client sends the total it DISPLAYED; if a
  // teacher moved a price between render and tap, the buyer would authorise
  // one figure and the wallet would debit another — refuse with the fresh
  // total so the page re-shows it instead of charging through the surprise.
  if (body.expectedTotalCents !== null && body.expectedTotalCents !== totalCents) {
    return NextResponse.json({ error: 'price_changed', totalCents }, { status: 409 });
  }
  // ONE conversion of the basket TOTAL — the same figure the cart page
  // displays, so summary and debit cannot disagree. Per-course gourdes are
  // allocated from the amount the provider actually reports at settlement
  // (lib/payments/cart.ts's `allocateHtgShares`), never re-derived.
  const amountHtg = usdCentsToHtg(totalCents, rate);
  if (amountHtg <= 0) {
    console.error('[checkout/moncash] refusing a zero-gourde charge', { rate, cents: totalCents });
    return NextResponse.json({ error: 'bad_amount' }, { status: 400 });
  }
  // MonCash refuses anything above MONCASH_MAX_HTG in one transaction (a
  // limit of the underlying wallet, not of any one integrator — see that
  // constant's own doc comment). Checked on the BASKET total, before the
  // network call, so an over-limit cart fails with a reason the buyer can
  // act on (buy fewer courses at once) rather than a provider error.
  if (amountHtg > MONCASH_MAX_HTG) {
    console.error('[checkout/moncash] refusing a charge above the MonCash limit', { amountHtg, rate });
    return NextResponse.json({ error: 'amount_too_large' }, { status: 400 });
  }

  const locale = body.locale === 'fr' ? 'fr' : 'ht';

  // One checkout_sessions row PER COURSE. For a single course the row's own
  // id is the MonCash orderId, exactly as before this feature. For a basket,
  // the rows share a fresh cartId and THAT is the orderId — the wallets take
  // one payment for the whole basket, and settlement fans back out to the
  // rows (lib/payments/moncash-order.ts).
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
          sessionId: encodeMoncashRef(locale),
          cartId,
        })),
      )
      .returning({ id: checkoutSessions.id });
    rowIds = inserted.map((r) => r.id);
    orderId = cartId ?? rowIds[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    // A live DB that still lags migration 0021 (`cart_id`). Drizzle names
    // every schema column in every INSERT (proved in db/checkout-compat.ts),
    // so even a single-course insert trips over the missing column. Two
    // honest outcomes:
    //   - A BASKET cannot fall back — unlinked rows for one charged total
    //     would strand the buyer's money. Refuse it plainly.
    //   - A SINGLE purchase retries through the pre-0021 twin table and
    //     keeps working exactly as before the column existed.
    if (cartId) {
      console.error('[checkout/moncash] cart refused — checkout_sessions.cart_id missing, run `npm run db:push`.');
      return NextResponse.json({ error: 'cart_unavailable' }, { status: 503 });
    }
    console.warn('[checkout/moncash] insert fell back to pre-0021 columns — run `npm run db:push`.');
    const inserted = await db
      .insert(checkoutSessionsPre0021)
      .values({
        userId: row.id,
        productType: 'course',
        courseSlug: products[0].courseSlug,
        amountCents: products[0].amountCents,
        sessionId: encodeMoncashRef(locale),
      })
      .returning({ id: checkoutSessionsPre0021.id });
    rowIds = inserted.map((r) => r.id);
    orderId = rowIds[0];
  }

  const origin = req.nextUrl.origin;

  const created = await createMoncashOrder({
    orderId,
    amountHtg,
    description:
      products.length === 1 ? products[0].courseSlug! : `PNICE Academy — ${products.length} kou`,
    // Bazik takes these per request; Digicel ignores them (its URLs are fixed
    // in the merchant portal). Sending them always keeps this call site free
    // of provider knowledge — and gives Bazik buyers a return that already
    // knows the order and the language.
    successUrl: `${origin}/api/payments/moncash/retour?orderId=${encodeURIComponent(orderId)}`,
    errorUrl:
      products.length === 1
        ? `${origin}/${locale}/checkout?course=${encodeURIComponent(products[0].courseSlug!)}`
        : `${origin}/${locale}/panye`,
    webhookUrl: `${origin}/api/webhooks/moncash?orderId=${encodeURIComponent(orderId)}`,
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

  // Persist the PROVIDER's reference AND which provider minted it — on
  // EVERY row of the basket, so the reconcile cron can recover any single
  // row on its own. For Digicel the ref is our own order id, but Bazik
  // mints its own and only answers to that — without the ref, a Bazik
  // payment could never be verified. Without the provider id, settlement
  // would re-resolve the provider from whatever the env says is active AT
  // VERIFICATION TIME instead of the one that actually created this order —
  // see retrieveMoncashOrderFrom's header for why that can silently break a
  // real, paid order if the default changes in between.
  await db
    .update(checkoutSessions)
    .set({ sessionId: encodeMoncashRef(locale, created.providerRef, created.provider) })
    .where(inArray(checkoutSessions.id, rowIds));

  return NextResponse.json({ url: created.redirectUrl, amountHtg, orderId });
}
