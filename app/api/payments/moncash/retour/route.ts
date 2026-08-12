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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
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

    default:
      // unknown_order / not_configured / error — the money may well have left
      // their wallet, so never imply failure on their side. Their dashboard is
      // where access appears once the notification callback settles it.
      console.error(`[moncash/retour] order ${orderId}: ${result.status}`);
      return NextResponse.redirect(`${origin}/${locale}/tableau-de-bord`, { status: 303 });
  }
}
