/**
 * POST /api/billing-portal — opens a Stripe billing-portal session for the
 * signed-in subscriber (Stage: learner account). Same conventions as
 * /api/checkout: 503 until Clerk+Stripe+DB are configured, 401 signed out,
 * and the client redirects to the returned { url }.
 *
 * The portal is scoped to the CUSTOMER behind the learner's own most recent
 * Stripe subscription row — resolved server-side from our DB, never from
 * client input, so nobody can open another person's portal.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { desc, and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { clerkEnabled } from '@/lib/clerk';
import {
  stripeConfigured,
  getStripeSubscriptionCustomerId,
  createBillingPortalSession,
} from '@/lib/payments/stripe';
import { resolveUserId } from '@/lib/learner/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const T = schema;

export async function POST(req: NextRequest) {
  if (!clerkEnabled || !stripeConfigured() || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return NextResponse.json({ error: 'no_subscription' }, { status: 404 });

    // Most recent Stripe-backed subscription — the portal manages the whole
    // customer, so any of the learner's subscriptions resolves the same
    // portal; newest first simply favours the ref most likely still valid.
    const [sub] = await db
      .select({ providerRef: T.subscriptions.providerRef })
      .from(T.subscriptions)
      .where(
        and(
          eq(T.subscriptions.userId, userId),
          eq(T.subscriptions.provider, 'stripe'),
          isNotNull(T.subscriptions.providerRef),
        ),
      )
      .orderBy(desc(T.subscriptions.createdAt))
      .limit(1);
    if (!sub?.providerRef) {
      return NextResponse.json({ error: 'no_subscription' }, { status: 404 });
    }

    const customerId = await getStripeSubscriptionCustomerId(sub.providerRef);
    if (!customerId) return NextResponse.json({ error: 'no_customer' }, { status: 502 });

    const locale = req.nextUrl.searchParams.get('locale') === 'fr' ? 'fr' : 'ht';
    const returnUrl = `${req.nextUrl.origin}/${locale}/kont?tab=subscription`;
    const session = await createBillingPortalSession(customerId, returnUrl);
    if ('error' in session) {
      console.error('[billing-portal] stripe error:', session.error);
      return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing-portal] failed:', err);
    return NextResponse.json({ error: 'error' }, { status: 500 });
  }
}
