/**
 * GET /api/payments/moncash/status?orderId=… — has the buyer approved yet?
 *
 * In MonCash's Merchant API the buyer never leaves this site: the cash-out
 * request lands on their handset and they approve it there. Nothing tells the
 * page when that happened, so the page asks here every couple of seconds while
 * showing "check your phone".
 *
 * Answering is the SAME idempotent settlement the two Digicel callbacks use
 * (`settleMoncashOrder` — it re-asks MonCash and grants access on their answer
 * alone), so whichever of the three learns first completes the purchase and
 * the others become no-ops. That also means a buyer refreshing, or opening a
 * second tab, can never double-grant or double-charge.
 *
 * OWNERSHIP: an order id is a UUID nobody can guess, but guessing is not the
 * threat model — leaking WHOSE order it is would be. So the route refuses any
 * order that does not belong to the signed-in caller, and says only
 * 'unknown_order' rather than confirming someone else's order exists.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { checkoutSessions, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { clerkEnabled } from '@/lib/clerk';
import { moncashSellable } from '@/lib/payments/providers';
import { settleMoncashOrder } from '@/lib/payments/moncash-order';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!clerkEnabled || !moncashSellable() || !process.env.DATABASE_URL) {
    return NextResponse.json({ status: 'not_configured' }, { status: 503 });
  }
  if (!rateLimit('checkout', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.json({ status: 'rate_limited' }, { status: 429 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ status: 'unauthorized' }, { status: 401 });

  const orderId = req.nextUrl.searchParams.get('orderId')?.trim();
  if (!orderId) return NextResponse.json({ status: 'unknown_order' }, { status: 400 });

  // Ownership check before touching MonCash — one join, and it also means a
  // signed-in stranger can't use this endpoint to probe order ids.
  const owned = (
    await db
      .select({ id: checkoutSessions.id })
      .from(checkoutSessions)
      .innerJoin(users, eq(users.id, checkoutSessions.userId))
      .where(and(eq(checkoutSessions.id, orderId), eq(users.clerkId, clerkId)))
      .limit(1)
  )[0];
  if (!owned) return NextResponse.json({ status: 'unknown_order' }, { status: 404 });

  const result = await settleMoncashOrder(orderId);
  return NextResponse.json({
    status: result.status,
    courseSlug: result.courseSlug ?? null,
    locale: result.locale,
  });
}
