/**
 * MonCash "Alert Url" — where the BUYER's browser lands after paying, the URL
 * given to Digicel as *Thank you page*.
 *
 * It is an API route rather than a page for one reason: MonCash stores a
 * single, fixed callback URL, but this site is bilingual. Settling the order
 * here lets us read the buyer's language off their own checkout row and send
 * them to the right thank-you page — and, more importantly, it means access is
 * granted before they ever see a confirmation, so the page they land on tells
 * the truth.
 *
 * Verification is identical to the notification endpoint (both call
 * `settleMoncashOrder`, which asks MonCash directly and is idempotent), so a
 * buyer refreshing this URL, or MonCash calling both endpoints, can never
 * double-grant or double-charge.
 */
import { NextRequest, NextResponse } from 'next/server';
import { settleMoncashOrder } from '@/lib/payments/moncash-order';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  // This URL is public by necessity (MonCash calls it) and is now ALSO the
  // buyer's own "check again" button, so it invites repeat hits. Each one
  // costs a round trip to the provider — rate-limit per IP so a held-down
  // refresh cannot turn into a flood against Bazik. Over the limit, the buyer
  // still lands somewhere useful rather than seeing a 429.
  if (!rateLimit('moncash-retour', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.redirect(`${origin}/ht/tableau-de-bord`, { status: 303 });
  }
  const params = req.nextUrl.searchParams;
  const orderId =
    params.get('orderId') ?? params.get('order_id') ?? params.get('reference') ?? params.get('orderID');

  // No order reference at all — nothing to verify. Send them somewhere useful
  // rather than showing an error they can't act on.
  if (!orderId?.trim()) {
    return NextResponse.redirect(`${origin}/ht/tableau-de-bord`, { status: 303 });
  }

  const result = await settleMoncashOrder(orderId.trim());
  const locale = result.locale;

  switch (result.status) {
    case 'granted':
    case 'already':
      // `moncash=1` lets the merci page know this was a MonCash purchase (it
      // has no Stripe session_id to read) and show the course they just got.
      return NextResponse.redirect(
        `${origin}/${locale}/checkout/merci?moncash=1${
          result.courseSlug ? `&course=${encodeURIComponent(result.courseSlug)}` : ''
        }`,
        { status: 303 },
      );

    case 'unpaid':
      // They backed out or the payment never cleared. Return them to the
      // course's checkout so retrying is one tap, not a hunt.
      return NextResponse.redirect(
        `${origin}/${locale}/checkout${result.courseSlug ? `?course=${encodeURIComponent(result.courseSlug)}` : ''}`,
        { status: 303 },
      );

    default: {
      // unknown_order / not_configured / error — the money may well have left
      // their wallet, so never imply failure on their side.
      //
      // This used to drop them on their dashboard, which then greeted a buyer
      // who had JUST paid with "you aren't enrolled in any course yet, go
      // browse the catalogue". Send them instead to a thank-you page in its
      // honest PENDING state: it names what they bought, gives them the
      // reference to quote, and offers a one-tap re-check that comes straight
      // back here. The reconciliation cron settles it even if they never tap.
      console.error(`[moncash/retour] order ${orderId}: ${result.status}`);
      const params = new URLSearchParams({ moncash: '1', pending: '1', order: orderId.trim() });
      if (result.courseSlug) params.set('course', result.courseSlug);
      return NextResponse.redirect(`${origin}/${locale}/checkout/merci?${params}`, { status: 303 });
    }
  }
}
