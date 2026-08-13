/**
 * lib/payments/natcash-order.ts — "verify, then grant" for the NatCash rail.
 *
 * Deliberately its own module rather than a branch inside
 * lib/payments/moncash-order.ts. The two rails settle on DIFFERENT EVIDENCE,
 * and blurring that would be the dangerous kind of code reuse:
 *
 *   - MonCash: Digicel and Bazik both answer "was this order paid?", so the
 *     rule there is "never trust a callback, ask the provider".
 *   - NatCash via Kobara: no retrieve endpoint is documented. The authority is
 *     the HMAC-SHA256 signature on Kobara's `payment.succeeded` webhook, which
 *     app/api/webhooks/natcash/route.ts verifies before calling in here.
 *
 * What the two DO share is fulfilment — `fulfillMoncashOrder` with
 * `rail: 'natcash'` — so enrolment, the teacher's 70%, the receipt and the
 * idempotency rule are literally the same code, and cannot drift.
 */
import { db } from '@/db';
import { checkoutSessions, webhookLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { fulfillMoncashOrder } from './moncash-fulfill';
import { natcashConfigured, retrieveNatcashOrder } from './natcash';

const REF_PREFIX = 'natcash:';

/**
 * `checkout_sessions.sessionId` carries the buyer's language and Kobara's own
 * payment id, encoded `natcash:<locale>[:<providerRef>]` — the same trick the
 * MonCash rail uses, and for the same reason: callback URLs are stateless, and
 * the column has no other job on one of these rows. It also keeps the Stripe
 * checkout route's pending-session guard able to tell the rails apart by
 * prefix alone.
 */
export function encodeNatcashRef(locale: 'ht' | 'fr', providerRef?: string | null): string {
  return providerRef ? `${REF_PREFIX}${locale}:${providerRef}` : `${REF_PREFIX}${locale}`;
}

/** Pure — the locale out of an encoded ref; anything unexpected reads as 'ht'. */
export function decodeNatcashLocale(ref: string | null | undefined): 'ht' | 'fr' {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return 'ht';
  return ref.slice(REF_PREFIX.length).split(':')[0] === 'fr' ? 'fr' : 'ht';
}

/** Pure — Kobara's payment id, or null on a row recorded before it was known. */
export function decodeNatcashProviderRef(ref: string | null | undefined): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return null;
  const rest = ref.slice(REF_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;
  return rest.slice(sep + 1).trim() || null;
}

/** True when this checkout row was started through NatCash. */
export function isNatcashRef(ref: string | null | undefined): boolean {
  return typeof ref === 'string' && ref.startsWith(REF_PREFIX);
}

export type NatcashSettleResult =
  | { status: 'granted' | 'already'; locale: 'ht' | 'fr'; courseSlug: string }
  | { status: 'pending' | 'unpaid' | 'unknown_order' | 'not_configured' | 'error'; locale: 'ht' | 'fr'; courseSlug?: string };

/** Best-effort ops signal, mirroring the MonCash rail's. NEVER THROWS. */
async function logNatcashFailure(orderId: string, eventType: string, message: string): Promise<void> {
  try {
    await db.insert(webhookLogs).values({
      provider: 'natcash',
      eventType,
      status: 'failed',
      errorMessage: message,
      providerRef: orderId,
      processedAt: new Date(),
    });
  } catch (e) {
    console.error('[natcash/order] webhook log write failed:', e instanceof Error ? e.message : e);
  }
}

/** What a VERIFIED webhook told us. Only this module's caller may build one. */
export type NatcashProof = {
  paid: boolean;
  amountHtg: number | null;
  transactionId: string | null;
};

/**
 * Grants access for `orderId` on evidence already established by the caller —
 * i.e. a webhook whose HMAC signature verified against our shared secret.
 *
 * NEVER THROWS: this runs inside a webhook handler that must answer 200 so the
 * gateway stops redelivering, and idempotence (in `fulfillMoncashOrder`) makes
 * a redelivery harmless anyway.
 */
export async function settleNatcashWithProof(orderId: string, proof: NatcashProof): Promise<NatcashSettleResult> {
  if (!process.env.DATABASE_URL) return { status: 'not_configured', locale: 'ht' };
  try {
    const row = (
      await db
        .select({
          id: checkoutSessions.id,
          userId: checkoutSessions.userId,
          courseSlug: checkoutSessions.courseSlug,
          amountCents: checkoutSessions.amountCents,
          sessionId: checkoutSessions.sessionId,
          completedAt: checkoutSessions.completedAt,
        })
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, orderId))
        .limit(1)
    )[0];

    if (!row || !row.userId || !row.courseSlug) {
      await logNatcashFailure(orderId, 'order.unknown', 'checkout_sessions row not found or incomplete');
      return { status: 'unknown_order', locale: 'ht' };
    }
    const locale = decodeNatcashLocale(row.sessionId);
    if (!proof.paid) return { status: 'unpaid', locale, courseSlug: row.courseSlug };

    const outcome = await fulfillMoncashOrder({
      rail: 'natcash',
      orderId,
      userDbId: row.userId,
      courseSlug: row.courseSlug,
      amountHtg: proof.amountHtg ?? 0,
      // The USD price the order was created from — the platform's one
      // accounting unit, and what the teacher's 70% is computed on.
      usdCentsEquivalent: row.amountCents,
      transactionId: proof.transactionId,
      locale,
    });
    if (outcome === 'error') {
      await logNatcashFailure(orderId, 'order.fulfill', 'fulfillMoncashOrder returned error');
      return { status: 'error', locale, courseSlug: row.courseSlug };
    }

    if (!row.completedAt) {
      await db
        .update(checkoutSessions)
        .set({ completedAt: new Date() })
        .where(eq(checkoutSessions.id, orderId))
        .catch(() => {});
    }
    return { status: outcome === 'processed' ? 'granted' : 'already', locale, courseSlug: row.courseSlug };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[natcash/order] settle failed:', message);
    await logNatcashFailure(orderId, 'order.settle', message);
    return { status: 'error', locale: 'ht' };
  }
}

/**
 * Asks Kobara about an order, for the buyer's own return page.
 *
 * 'pending' IS NOT 'unpaid'. Kobara documents no retrieve endpoint, so this
 * frequently cannot get a definitive answer — and the buyer standing here has
 * very likely already been debited. Reporting "unpaid" would send them back to
 * checkout to pay a second time. Anything short of a confirmed success is
 * therefore 'pending', and the thank-you page says "we're checking" while the
 * signed webhook does the actual granting.
 */
export async function settleNatcashOrder(orderId: string): Promise<NatcashSettleResult> {
  if (!natcashConfigured() || !process.env.DATABASE_URL) {
    return { status: 'not_configured', locale: 'ht' };
  }
  try {
    const row = (
      await db
        .select({
          courseSlug: checkoutSessions.courseSlug,
          sessionId: checkoutSessions.sessionId,
          completedAt: checkoutSessions.completedAt,
        })
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, orderId))
        .limit(1)
    )[0];
    if (!row || !row.courseSlug) return { status: 'unknown_order', locale: 'ht' };

    const locale = decodeNatcashLocale(row.sessionId);
    // Already settled by the webhook — say so without a network call.
    if (row.completedAt) return { status: 'already', locale, courseSlug: row.courseSlug };

    const providerRef = decodeNatcashProviderRef(row.sessionId);
    if (!providerRef) return { status: 'pending', locale, courseSlug: row.courseSlug };

    const remote = await retrieveNatcashOrder(providerRef);
    if (!remote.ok || !remote.paid) {
      return { status: 'pending', locale, courseSlug: row.courseSlug };
    }
    return settleNatcashWithProof(orderId, {
      paid: true,
      amountHtg: remote.amountHtg,
      transactionId: remote.transactionId,
    });
  } catch (e) {
    console.error('[natcash/order] check failed:', e instanceof Error ? e.message : e);
    return { status: 'error', locale: 'ht' };
  }
}
