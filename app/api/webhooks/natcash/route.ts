/**
 * POST /api/webhooks/natcash — Kobara's `payment.succeeded` notification.
 *
 * THIS ENDPOINT IS THE AUTHORITY ON THIS RAIL. Unlike MonCash, where Digicel
 * and Bazik both answer "was this order paid?", Kobara documents no retrieve
 * endpoint — so access is granted on the strength of the HMAC-SHA256 signature
 * carried in `Kobara-Signature`, verified here against `KOBARA_WEBHOOK_SECRET`
 * over the RAW request body. That is the same class of proof Stripe's webhook
 * signature provides, and the same discipline app/api/webhooks/stripe applies.
 *
 * NOTHING IS TRUSTED BEFORE THE SIGNATURE VERIFIES. An unsigned, wrongly
 * signed, stale (replayed), or unverifiable-because-no-secret request is
 * refused before a single row is read — otherwise anyone who guessed a
 * checkout id could grant themselves a paid course by POSTing JSON here.
 *
 * ALWAYS ANSWERS 200 ONCE VERIFIED, whatever happened downstream: Kobara
 * redelivers on anything else, and fulfilment is idempotent, so a retry storm
 * would achieve nothing but noise. Real failures are recorded in
 * `webhook_logs` (visible on /admin/sante) instead of being signalled by a 5xx.
 */
import { NextRequest, NextResponse } from 'next/server';
import { kobaraWebhookSecret, readKobaraEvent, verifyKobaraSignature } from '@/lib/payments/natcash/kobara';
import { settleNatcashWithProof } from '@/lib/payments/natcash-order';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = kobaraWebhookSecret();
  if (!secret) {
    // No secret means no way to tell a genuine notification from a forged one.
    // 503, not 200: this is a configuration failure the operator must see, and
    // Kobara retrying later is exactly the right behaviour.
    console.error('[webhook/natcash] KOBARA_WEBHOOK_SECRET is not set — refusing to trust any notification');
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }

  // The RAW body, before any parsing — the signature covers these exact bytes.
  const raw = await req.text();
  if (!verifyKobaraSignature(raw, req.headers.get('kobara-signature'), secret, Date.now())) {
    console.error('[webhook/natcash] signature verification failed');
    return NextResponse.json({ ok: false, reason: 'bad_signature' }, { status: 401 });
  }

  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_json' }, { status: 400 });
  }

  const event = readKobaraEvent(parsed);
  if (!event) return NextResponse.json({ ok: true, ignored: 'no_payment' });
  if (!event.paid) return NextResponse.json({ ok: true, ignored: `status_${event.eventType}` });

  // OUR order id travels in `metadata.order_id` (set at creation). Without it
  // there is nothing to attach the payment to — say so plainly rather than
  // guessing at a checkout row.
  if (!event.orderId) {
    console.error('[webhook/natcash] verified event carries no order_id', event.paymentId);
    return NextResponse.json({ ok: true, ignored: 'no_order_id' });
  }

  const result = await settleNatcashWithProof(event.orderId, {
    paid: true,
    amountHtg: event.amountHtg,
    transactionId: event.transactionId,
  });
  if (result.status === 'error' || result.status === 'unknown_order') {
    console.error(`[webhook/natcash] order ${event.orderId}: ${result.status}`);
  }
  return NextResponse.json({ ok: true, status: result.status });
}
