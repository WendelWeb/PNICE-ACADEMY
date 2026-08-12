/**
 * lib/payments/moncash-order.ts — the shared "verify then grant" step, used by
 * BOTH MonCash callbacks.
 *
 * MonCash gives a merchant two URLs to configure and their names are ambiguous
 * enough that integrators routinely wire them the wrong way round ("Return Url
 * (payment notification)" vs "Alert Url (thank you page)"). Rather than bet on
 * which one fires, both of this app's endpoints call THIS function, and it is
 * safe to call any number of times for the same order — whichever arrives
 * first completes the purchase, the other becomes a no-op.
 *
 * It never trusts the callback's query string about whether money moved: the
 * only accepted proof is MonCash's own `RetrieveOrderPayment` answering
 * `message: "successful"` for our order id.
 */
import { db } from '@/db';
import { checkoutSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { retrieveMoncashOrder, moncashConfigured } from './moncash';
import { fulfillMoncashOrder } from './moncash-fulfill';

/** How the locale is smuggled onto the order row — see `encodeMoncashRef`. */
const REF_PREFIX = 'moncash:';

/**
 * MonCash's callback URLs are configured once, in their dashboard, so they
 * carry no per-order state — yet the receipt and the thank-you redirect need
 * the buyer's language. `checkout_sessions` has no locale column, and adding
 * one would mean a migration the owner must apply before MonCash could work at
 * all. So the locale rides along in the row's free-text provider-reference
 * field, which for a MonCash order has no other job.
 *
 * The Stripe checkout route filters these rows out of its pending-session
 * guard by this same prefix — a value starting with `moncash:` is never a
 * Stripe session id.
 */
export function encodeMoncashRef(locale: 'ht' | 'fr'): string {
  return `${REF_PREFIX}${locale}`;
}

/** Pure inverse of `encodeMoncashRef`; anything unexpected reads as 'ht'. */
export function decodeMoncashLocale(ref: string | null | undefined): 'ht' | 'fr' {
  return ref === `${REF_PREFIX}fr` ? 'fr' : 'ht';
}

/** True when this checkout row was started through MonCash rather than Stripe. */
export function isMoncashRef(ref: string | null | undefined): boolean {
  return typeof ref === 'string' && ref.startsWith(REF_PREFIX);
}

export type SettleResult =
  | { status: 'granted' | 'already'; locale: 'ht' | 'fr'; courseSlug: string }
  | { status: 'unpaid' | 'unknown_order' | 'not_configured' | 'error'; locale: 'ht' | 'fr'; courseSlug?: string };

/**
 * Verifies `orderId` against MonCash and, if it really was paid, grants
 * access. NEVER THROWS — callers are HTTP endpoints that must answer calmly
 * even when MonCash or the DB is having a bad minute.
 */
export async function settleMoncashOrder(orderId: string): Promise<SettleResult> {
  if (!moncashConfigured() || !process.env.DATABASE_URL) {
    return { status: 'not_configured', locale: 'ht' };
  }
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
      return { status: 'unknown_order', locale: 'ht' };
    }
    const locale = decodeMoncashLocale(row.sessionId);

    const remote = await retrieveMoncashOrder(orderId);
    if (!remote.ok) {
      console.error('[moncash/order] retrieval failed:', remote.message);
      return { status: 'error', locale, courseSlug: row.courseSlug };
    }
    if (!remote.paid) {
      // Abandoned or still pending. Not an error — the buyer may simply have
      // backed out; nothing is granted and nothing is recorded.
      return { status: 'unpaid', locale, courseSlug: row.courseSlug };
    }

    const outcome = await fulfillMoncashOrder({
      orderId,
      userDbId: row.userId,
      courseSlug: row.courseSlug,
      // What MonCash says it took, falling back to what we asked for.
      amountHtg: remote.costHtg ?? 0,
      usdCentsEquivalent: row.amountCents,
      transactionId: remote.transactionId,
      locale,
    });
    if (outcome === 'error') return { status: 'error', locale, courseSlug: row.courseSlug };

    // Mark the cart closed so the abandoned-cart cron stops chasing it. Best
    // effort and idempotent; access has already been granted above.
    if (!row.completedAt) {
      await db
        .update(checkoutSessions)
        .set({ completedAt: new Date() })
        .where(eq(checkoutSessions.id, orderId))
        .catch(() => {});
    }

    return {
      status: outcome === 'processed' ? 'granted' : 'already',
      locale,
      courseSlug: row.courseSlug,
    };
  } catch (e) {
    console.error('[moncash/order] settle failed:', e instanceof Error ? e.message : e);
    return { status: 'error', locale: 'ht' };
  }
}
