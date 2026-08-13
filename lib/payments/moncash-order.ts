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

/** How MonCash state is smuggled onto the order row — see `encodeMoncashRef`. */
const REF_PREFIX = 'moncash:';

/**
 * `checkout_sessions.sessionId` carries two things a MonCash order needs and
 * has nowhere else to put, encoded as `moncash:<locale>[:<providerRef>]`:
 *
 *   1. THE BUYER'S LANGUAGE. Digicel's callback URLs are configured once, in
 *      their portal, so they arrive with no per-order state — yet the receipt
 *      and the thank-you redirect must be in the right language.
 *   2. THE PROVIDER'S OWN REFERENCE. Digicel looks a payment up by the id WE
 *      chose, but Bazik mints its own (`BZK_sandbox_…`) and only answers to
 *      that. Without persisting it, a Bazik payment could never be verified.
 *
 * That column is free text and has no other job on a MonCash row, so this
 * avoids a migration the owner would have to apply before MonCash could work
 * at all. The Stripe checkout route filters these rows out of its
 * pending-session guard by this same prefix — a value starting with
 * `moncash:` is never a Stripe session id.
 */
export function encodeMoncashRef(locale: 'ht' | 'fr', providerRef?: string | null): string {
  return providerRef ? `${REF_PREFIX}${locale}:${providerRef}` : `${REF_PREFIX}${locale}`;
}

/** Pure — the locale out of an encoded ref; anything unexpected reads as 'ht'. */
export function decodeMoncashLocale(ref: string | null | undefined): 'ht' | 'fr' {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return 'ht';
  return ref.slice(REF_PREFIX.length).split(':')[0] === 'fr' ? 'fr' : 'ht';
}

/**
 * Pure — the provider's own reference, or null when the row predates it.
 * Callers fall back to our order id in that case, which is exactly right for
 * Digicel and the only sane guess for an order created before this encoding.
 */
export function decodeMoncashProviderRef(ref: string | null | undefined): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return null;
  const rest = ref.slice(REF_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;
  const providerRef = rest.slice(sep + 1).trim();
  return providerRef || null;
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

    // Verify by the PROVIDER's reference when we have one. Digicel answers to
    // our own order id, but Bazik only answers to the `BZK_…` id it minted, so
    // assuming our id here would make every Bazik payment unverifiable.
    const providerRef = decodeMoncashProviderRef(row.sessionId) ?? orderId;

    const remote = await retrieveMoncashOrder(providerRef);
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
      amountHtg: remote.amountHtg ?? 0,
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
