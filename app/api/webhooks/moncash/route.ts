/**
 * MonCash "Return Url" — the server-to-server payment notification, the URL
 * given to Digicel as *Link to receive the payment Notification*.
 *
 * MonCash does not sign these callbacks, so the request body is treated as a
 * HINT ONLY: it tells us which order to look at, never whether it was paid.
 * `settleMoncashOrder` re-asks MonCash directly (`RetrieveOrderPayment`) and
 * grants access only on their answer — which is why a forged POST here can
 * achieve nothing beyond making us query our own order.
 *
 * Accepts POST and GET because merchants report MonCash using either, and
 * always answers 200: a non-2xx would make MonCash retry a callback that is
 * already idempotent, and the buyer's own return to /api/payments/moncash/
 * retour is a second, independent chance to settle the same order anyway.
 */
import { NextRequest, NextResponse } from 'next/server';
import { settleMoncashOrder } from '@/lib/payments/moncash-order';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** MonCash has used several spellings across integrations; accept them all. */
function pickOrderId(source: Record<string, unknown> | URLSearchParams): string | null {
  const keys = ['orderId', 'order_id', 'reference', 'orderID'];
  for (const k of keys) {
    const v = source instanceof URLSearchParams ? source.get(k) : source[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  let orderId: string | null = null;

  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body) orderId = pickOrderId(body);
  }
  // Fall back to the query string for both verbs — some integrations put it there.
  if (!orderId) orderId = pickOrderId(req.nextUrl.searchParams);

  if (!orderId) return NextResponse.json({ ok: false, reason: 'no_order_id' });

  const result = await settleMoncashOrder(orderId);
  if (result.status === 'error' || result.status === 'unknown_order') {
    console.error(`[moncash/webhook] order ${orderId}: ${result.status}`);
  }
  return NextResponse.json({ ok: true, status: result.status });
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
