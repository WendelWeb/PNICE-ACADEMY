/**
 * Stripe webhook receiver. Mirrors app/api/webhooks/clerk/route.ts conventions:
 * 503 until configured, manual signature check, never logs secrets.
 * Idempotent: a Stripe event id already logged as processed is acked silently.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { verifyStripeSignature } from '@/lib/payments/stripe-verify';
import { mapStripeEvent } from '@/lib/payments/stripe-events';
import { fulfillAction } from '@/lib/payments/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  let evt: unknown;
  try {
    evt = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const action = mapStripeEvent(evt);
  const eventType = (evt as { type?: string }).type ?? 'unknown';

  const dup = await db
    .select({ id: webhookLogs.id })
    .from(webhookLogs)
    .where(and(eq(webhookLogs.providerRef, action.eventId), eq(webhookLogs.status, 'processed')))
    .limit(1);
  if (dup.length > 0) return NextResponse.json({ received: true, duplicate: true });

  try {
    const outcome = action.kind === 'ignored' ? 'ignored' : await fulfillAction(action);
    await db.insert(webhookLogs).values({
      provider: 'stripe',
      eventType,
      payload: evt,
      status: outcome === 'processed' ? 'processed' : 'ignored',
      providerRef: action.eventId,
      processedAt: new Date(),
    });
    return NextResponse.json({ received: true });
  } catch (e) {
    await db.insert(webhookLogs).values({
      provider: 'stripe',
      eventType,
      payload: evt,
      status: 'failed',
      errorMessage: e instanceof Error ? e.message : 'error',
      providerRef: action.eventId,
      processedAt: new Date(),
    });
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
