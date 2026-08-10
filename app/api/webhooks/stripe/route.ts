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
import { logAppError } from '@/lib/observability/errorLog';

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
  const eventType = (evt as { type?: string } | null)?.type ?? 'unknown';

  const dup = await db
    .select({ id: webhookLogs.id })
    .from(webhookLogs)
    .where(and(eq(webhookLogs.providerRef, action.eventId), eq(webhookLogs.status, 'processed'), eq(webhookLogs.provider, 'stripe')))
    .limit(1);
  if (dup.length > 0) return NextResponse.json({ received: true, duplicate: true });

  let outcome: 'processed' | 'ignored' | 'failed' = 'failed';
  let errorMessage: string | null = null;
  try {
    outcome = action.kind === 'ignored' ? 'ignored' : await fulfillAction(action);
  } catch (e) {
    outcome = 'failed';
    errorMessage = e instanceof Error ? e.message : 'error';
  }

  // Log the TRUE outcome; a log-write failure must never change the response.
  try {
    await db.insert(webhookLogs).values({
      provider: 'stripe',
      eventType,
      payload: evt,
      status: outcome,
      errorMessage,
      providerRef: action.eventId,
      processedAt: new Date(),
    });
  } catch (e) {
    console.error('[webhook:stripe] log write failed:', e instanceof Error ? e.message : e);
  }

  if (outcome === 'failed') {
    // Production hardening pass — real writer for /admin/sante's error-logs
    // panel: the highest-value server-side error source (the money path).
    // AWAITED (this route runs on a serverless function — an un-awaited
    // promise can be killed once the response below is returned); never
    // throws, must never change the response below.
    await logAppError({ message: errorMessage ?? 'stripe webhook processing failed', route: `webhook:stripe:${eventType}` });
    // 500 → Stripe retries later.
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
