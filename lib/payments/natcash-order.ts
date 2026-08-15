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
import { db, isMissingColumnError } from '@/db';
import { checkoutSessions, webhookLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
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
  cartId: checkoutSessions.cartId,
};

/** SETTLE_COLUMNS as a pre-0021 DB can answer them (cartId → null there). */
const SETTLE_COLUMNS_PRE_0021 = {
  id: checkoutSessions.id,
  userId: checkoutSessions.userId,
  courseSlug: checkoutSessions.courseSlug,
  amountCents: checkoutSessions.amountCents,
  sessionId: checkoutSessions.sessionId,
  completedAt: checkoutSessions.completedAt,
};

type SettleRow = {
  id: string;
  userId: string | null;
  courseSlug: string | null;
  amountCents: number;
  sessionId: string | null;
  completedAt: Date | null;
  cartId: string | null;
};

/**
 * Every row `orderId` stands for — ALWAYS the whole basket. Same three-way
 * resolution as the MonCash rail's `settleRowsFor`, for the same reason: a
 * basket row reached by its OWN id (recovery paths) must expand to its
 * siblings before any gourde allocation, or the basket's total gets booked
 * onto one course. ORDER BY id keeps the remainder-gourde split stable
 * across retries; only the missing-column error is swallowed (pre-0021 DB —
 * where no cart can exist), anything else rethrows.
 */
async function natcashSettleRowsFor(orderId: string): Promise<SettleRow[]> {
  let byId: SettleRow[];
  try {
    byId = await db.select(SETTLE_COLUMNS).from(checkoutSessions).where(eq(checkoutSessions.id, orderId)).limit(1);
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    const rows = await db
      .select(SETTLE_COLUMNS_PRE_0021)
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, orderId))
      .limit(1);
    return rows.map((r) => ({ ...r, cartId: null }));
  }
  if (byId.length > 0) {
    const cartId = byId[0].cartId;
    if (!cartId) return byId;
    return db
      .select(SETTLE_COLUMNS)
      .from(checkoutSessions)
      .where(eq(checkoutSessions.cartId, cartId))
      .orderBy(checkoutSessions.id);
  }
  try {
    return await db
      .select(SETTLE_COLUMNS)
      .from(checkoutSessions)
      .where(eq(checkoutSessions.cartId, orderId))
      .orderBy(checkoutSessions.id);
  } catch (err) {
    if (isMissingColumnError(err)) return [];
    throw err;
  }
}

export type NatcashSettleResult =
  | { status: 'granted' | 'already'; locale: 'ht' | 'fr'; courseSlug: string; courseCount?: number }
  | { status: 'pending' | 'unpaid' | 'unknown_order' | 'not_configured' | 'error'; locale: 'ht' | 'fr'; courseSlug?: string; courseCount?: number };

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
    const rows = (await natcashSettleRowsFor(orderId)).filter((r) => r.userId && r.courseSlug);

    if (rows.length === 0) {
      await logNatcashFailure(orderId, 'order.unknown', 'checkout_sessions row not found or incomplete');
      return { status: 'unknown_order', locale: 'ht' };
    }
    const first = rows[0];
    const locale = decodeNatcashLocale(first.sessionId);
    if (!proof.paid) return { status: 'unpaid', locale, courseSlug: first.courseSlug!, courseCount: rows.length };

    // One verified payment → one fulfilment PER COURSE through the shared
    // idempotent path; the basket's disclosed gourdes are allocated per
    // course so the receipts sum to the real debit (lib/payments/cart.ts).
    //
    // A failed course never aborts the loop, and each success closes its own
    // row immediately — the mirror of the MonCash settle, and doubly vital
    // here: Kobara gets a 200 either way (no redelivery), so the rows a
    // premature return would have skipped had NO automatic path back at all.
    const shares = allocateHtgShares(proof.amountHtg ?? 0, rows.map((r) => r.amountCents));
    let processed = 0;
    let failed = 0;
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
        failed += 1;
        await logNatcashFailure(row.id, 'order.fulfill', 'fulfillMoncashOrder returned error');
        continue;
      }
      if (outcome === 'processed') processed += 1;
      if (!row.completedAt) {
        await db
          .update(checkoutSessions)
          .set({ completedAt: new Date() })
          .where(eq(checkoutSessions.id, row.id))
          .catch(() => {});
      }
    }

    if (failed > 0) {
      return { status: 'error', locale, courseSlug: first.courseSlug!, courseCount: rows.length };
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
    // Same whole-basket resolution as `settleNatcashWithProof`.
    const usable = (await natcashSettleRowsFor(orderId)).filter((r) => r.courseSlug);
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
