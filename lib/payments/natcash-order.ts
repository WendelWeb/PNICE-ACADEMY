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
import { eq, inArray } from 'drizzle-orm';
import { fulfillMoncashOrder } from './moncash-fulfill';
import { natcashConfigured, retrieveNatcashOrder } from './natcash';
import { allocateHtgShares } from './cart';

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

const SETTLE_COLUMNS = {
  id: checkoutSessions.id,
  userId: checkoutSessions.userId,
  courseSlug: checkoutSessions.courseSlug,
  amountCents: checkoutSessions.amountCents,
  sessionId: checkoutSessions.sessionId,
  completedAt: checkoutSessions.completedAt,
};

export type NatcashSettleResult =
  | { status: 'granted' | 'already'; locale: 'ht' | 'fr'; courseSlug: string; courseCount?: number }
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
    // `orderId` is either one row's own id, or a basket's cartId (« panye »)
    // — same resolution rule as the MonCash rail. The cart lookup tolerates
    // a DB that still lags migration 0021: no column ⇒ no cart can exist.
    let rows = await db
      .select(SETTLE_COLUMNS)
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, orderId))
      .limit(1);
    if (rows.length === 0) {
      try {
        rows = await db.select(SETTLE_COLUMNS).from(checkoutSessions).where(eq(checkoutSessions.cartId, orderId));
      } catch {
        rows = [];
      }
    }
    rows = rows.filter((r) => r.userId && r.courseSlug);

    if (rows.length === 0) {
      await logNatcashFailure(orderId, 'order.unknown', 'checkout_sessions row not found or incomplete');
      return { status: 'unknown_order', locale: 'ht' };
    }
    const first = rows[0];
    const locale = decodeNatcashLocale(first.sessionId);
    if (!proof.paid) return { status: 'unpaid', locale, courseSlug: first.courseSlug! };

    // One verified payment → one fulfilment PER COURSE through the shared
    // idempotent path; the basket's disclosed gourdes are allocated per
    // course so the receipts sum to the real debit (lib/payments/cart.ts).
    const shares = allocateHtgShares(proof.amountHtg ?? 0, rows.map((r) => r.amountCents));
    let processed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const outcome = await fulfillMoncashOrder({
        rail: 'natcash',
        orderId: row.id,
        userDbId: row.userId!,
        courseSlug: row.courseSlug!,
        amountHtg: shares[i],
        // The USD price the order was created from — the platform's one
        // accounting unit, and what the teacher's 70% is computed on.
        usdCentsEquivalent: row.amountCents,
        transactionId: proof.transactionId,
        locale,
      });
      if (outcome === 'error') {
        await logNatcashFailure(row.id, 'order.fulfill', 'fulfillMoncashOrder returned error');
        return { status: 'error', locale, courseSlug: row.courseSlug! };
      }
      if (outcome === 'processed') processed += 1;
    }

    const openIds = rows.filter((r) => !r.completedAt).map((r) => r.id);
    if (openIds.length > 0) {
      await db
        .update(checkoutSessions)
        .set({ completedAt: new Date() })
        .where(inArray(checkoutSessions.id, openIds))
        .catch(() => {});
    }
    return {
      status: processed > 0 ? 'granted' : 'already',
      locale,
      courseSlug: first.courseSlug!,
      courseCount: rows.length,
    };
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
    // Same by-id-then-by-cart resolution as `settleNatcashWithProof`: for a
    // basket the return URL carries the CART id, which no row's own id equals.
    let rows = await db
      .select(SETTLE_COLUMNS)
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, orderId))
      .limit(1);
    if (rows.length === 0) {
      try {
        rows = await db.select(SETTLE_COLUMNS).from(checkoutSessions).where(eq(checkoutSessions.cartId, orderId));
      } catch {
        rows = [];
      }
    }
    const usable = rows.filter((r) => r.courseSlug);
    if (usable.length === 0) return { status: 'unknown_order', locale: 'ht' };
    const first = usable[0];

    const locale = decodeNatcashLocale(first.sessionId);
    // Already settled by the webhook — say so without a network call. For a
    // basket, EVERY row must be closed before this shortcut is honest.
    if (usable.every((r) => r.completedAt)) {
      return { status: 'already', locale, courseSlug: first.courseSlug!, courseCount: usable.length };
    }

    const providerRef = decodeNatcashProviderRef(first.sessionId);
    if (!providerRef) return { status: 'pending', locale, courseSlug: first.courseSlug! };

    const remote = await retrieveNatcashOrder(providerRef);
    if (!remote.ok || !remote.paid) {
      return { status: 'pending', locale, courseSlug: first.courseSlug! };
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
