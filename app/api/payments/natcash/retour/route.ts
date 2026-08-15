/**
 * GET /api/payments/natcash/retour — where the BUYER's browser lands after
 * paying with NatCash.
 *
 * An API route rather than a page because the site is bilingual and the
 * gateway's return URL is stateless: settling here lets us read the buyer's
 * language off their own checkout row and send them to the right page.
 *
 * IT DOES NOT DECIDE ANYTHING. On this rail the signed webhook is the
 * authority (app/api/webhooks/natcash), and it usually arrives first. This
 * route only ASKS — and if it cannot get a definitive "paid", it says
 * "we're checking" rather than "you didn't pay". Sending a buyer who has
 * already been debited back to the checkout page is how someone ends up
 * paying twice for one course.
 */
import { NextRequest, NextResponse } from 'next/server';
import { settleNatcashOrder } from '@/lib/payments/natcash-order';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  // Public by necessity and also the buyer's own "check again" button, so it
  // invites repeat hits — each costing a gateway round trip.
  if (!rateLimit('natcash-retour', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.redirect(`${origin}/ht/tableau-de-bord`, { status: 303 });
  }

  const params = req.nextUrl.searchParams;
  const orderId =
    params.get('orderId') ?? params.get('order_id') ?? params.get('reference') ?? params.get('orderID');
  if (!orderId?.trim()) {
    return NextResponse.redirect(`${origin}/ht/tableau-de-bord`, { status: 303 });
  }

  const result = await settleNatcashOrder(orderId.trim());
  const locale = result.locale;
  const course = result.courseSlug ? `&course=${encodeURIComponent(result.courseSlug)}` : '';

  switch (result.status) {
    case 'granted':
    case 'already':
      return NextResponse.redirect(
        `${origin}/${locale}/checkout/merci?natcash=1${course}${'courseCount' in result && result.courseCount && result.courseCount > 1 ? `&count=${result.courseCount}` : ''}`,
        { status: 303 },
      );

    case 'unpaid':
      // A definitive refusal from the gateway — they backed out. Back to the
      // course's checkout so retrying is one tap. Note that `settleNatcash-
      // Order` only ever returns this on a confirmed non-payment; anything
      // uncertain arrives below as 'pending'.
      return NextResponse.redirect(`${origin}/${locale}/checkout?${course.slice(1)}`, { status: 303 });

    default: {
      // pending / unknown_order / not_configured / error — the money may well
      // have left their wallet. Say we're checking, show the reference, and
      // let the webhook (or a tap on "check again") finish the job.
      const qs = new URLSearchParams({ natcash: '1', pending: '1', order: orderId.trim() });
      if (result.courseSlug) qs.set('course', result.courseSlug);
      return NextResponse.redirect(`${origin}/${locale}/checkout/merci?${qs}`, { status: 303 });
    }
  }
}
