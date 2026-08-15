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
import { checkoutSessions, webhookLogs } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { retrieveMoncashOrderFrom, moncashConfigured } from './moncash';
import type { MoncashProviderId } from './moncash';
import { fulfillMoncashOrder } from './moncash-fulfill';
import { allocateHtgShares } from './cart';

/**
 * Best-effort ops signal for MonCash — the platform's only live real-money
 * rail otherwise writes NOTHING to `webhook_logs` (that table used to be
 * written by the Stripe webhook route only), so a Bazik/Digicel outage was
 * invisible to /admin/sante's stale-failure alert. Mirrors the shape the
 * Stripe route writes (provider/eventType/status/errorMessage/providerRef)
 * closely enough that the SAME alert + replay UI covers this rail too.
 * NEVER THROWS — a logging hiccup must never change what the callback
 * answers to MonCash.
 */
async function logMoncashFailure(orderId: string, eventType: string, message: string): Promise<void> {
  try {
    await db.insert(webhookLogs).values({
      provider: 'moncash',
      eventType,
      status: 'failed',
      errorMessage: message,
      providerRef: orderId,
      processedAt: new Date(),
    });
  } catch (e) {
    console.error('[moncash/order] webhook log write failed:', e instanceof Error ? e.message : e);
  }
}

/** How MonCash state is smuggled onto the order row — see `encodeMoncashRef`. */
const REF_PREFIX = 'moncash:';

/* ----------------------------- verification retry ------------------------- */

/**
 * A provider failure worth asking again about, as opposed to an answer.
 *
 * `timeout` and 5xx mean Bazik/Digicel had a bad second, not that the money
 * didn't move — and the buyer is standing in front of this request having
 * already been debited. Everything else ('not_found', 'not_configured',
 * 'order_provider_unavailable', a 4xx) is a real answer: asking again would
 * only get the same one, slower.
 */
function isTransient(message: string): boolean {
  return message === 'timeout' || /^HTTP 5\d\d/.test(message) || /fetch|network|ECONN|socket/i.test(message);
}

/** Attempt schedule in milliseconds — the pause BEFORE attempt 2 and 3. */
const RETRY_DELAYS_MS = [400, 900];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the provider whether an order was paid, and does not give up on the
 * first bad answer.
 *
 * TWO failures are retried, both of which used to strand a buyer who had
 * really paid:
 *
 *   1. A TRANSIENT PROVIDER ERROR. The old code returned 'error' on the first
 *      timeout, the callback ended, and nothing ever re-checked — money taken,
 *      access never granted, and no automatic path back.
 *   2. A "NOT PAID YET" ANSWER. Bazik can still report an order as pending for
 *      a moment after the buyer confirms on their handset. The old code read
 *      that as "they backed out" and sent them to checkout — inviting a SECOND
 *      payment for a course they had just bought.
 *
 * Bounded on purpose: this runs inside the buyer's own redirect, so it costs
 * at most ~1.3s of extra wait before answering honestly. The reconciliation
 * cron (app/api/cron/moncash-reconcile) is what covers everything past that.
 */
async function retrieveWithRetry(
  providerId: MoncashProviderId | null,
  providerRef: string,
): Promise<Awaited<ReturnType<typeof retrieveMoncashOrderFrom>>> {
  let last = await retrieveMoncashOrderFrom(providerId, providerRef);
  for (const delay of RETRY_DELAYS_MS) {
    const settled = last.ok ? last.paid : !isTransient(last.message);
    if (settled) return last;
    await sleep(delay);
    last = await retrieveMoncashOrderFrom(providerId, providerRef);
  }
  return last;
}

/**
 * `checkout_sessions.sessionId` carries three things a MonCash order needs
 * and has nowhere else to put, encoded as
 * `moncash:<locale>[:<providerId>:<providerRef>]`:
 *
 *   1. THE BUYER'S LANGUAGE. Digicel's callback URLs are configured once, in
 *      their portal, so they arrive with no per-order state — yet the receipt
 *      and the thank-you redirect must be in the right language.
 *   2. WHICH PROVIDER CREATED THE ORDER. Verification must ask the SAME
 *      company back — asking the other one for a reference it never minted
 *      reads as "not found" even though the buyer really paid. Without this,
 *      a MonCash order created while `direct` was the effective provider
 *      could stop verifying if `bazik` becomes the default before the buyer
 *      confirms (env change, credential rotation) — see
 *      `retrieveMoncashOrderFrom`'s header for the full story. Omitted when
 *      unknown (a row from before this field existed): the caller falls back
 *      to the OLD env-driven pick, same as before this fix.
 *   3. THE PROVIDER'S OWN REFERENCE. Digicel looks a payment up by the id WE
 *      chose, but Bazik mints its own (`BZK_sandbox_…`) and only answers to
 *      that. Without persisting it, a Bazik payment could never be verified.
 *
 * That column is free text and has no other job on a MonCash row, so this
 * avoids a migration the owner would have to apply before MonCash could work
 * at all. The Stripe checkout route filters these rows out of its
 * pending-session guard by this same prefix — a value starting with
 * `moncash:` is never a Stripe session id.
 *
 * BACKWARD COMPATIBLE with the two earlier shapes this same encoding used:
 * `moncash:<locale>` (no ref at all) and `moncash:<locale>:<providerRef>`
 * (ref but no providerId, from before `retrieveMoncashOrderFrom` existed) —
 * `decodeMoncashProviderRef`/`decodeMoncashProviderId` below read all three.
 */
export function encodeMoncashRef(
  locale: 'ht' | 'fr',
  providerRef?: string | null,
  providerId?: MoncashProviderId | null,
): string {
  if (!providerRef) return `${REF_PREFIX}${locale}`;
  return providerId
    ? `${REF_PREFIX}${locale}:${providerId}:${providerRef}`
    : `${REF_PREFIX}${locale}:${providerRef}`;
}

/** Pure — the locale out of an encoded ref; anything unexpected reads as 'ht'. */
export function decodeMoncashLocale(ref: string | null | undefined): 'ht' | 'fr' {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return 'ht';
  return ref.slice(REF_PREFIX.length).split(':')[0] === 'fr' ? 'fr' : 'ht';
}

/** True for the exact tokens `encodeMoncashRef` can put in the providerId slot. */
function isProviderId(value: string): value is MoncashProviderId {
  return value === 'direct' || value === 'bazik';
}

/**
 * Pure — the provider's own reference, or null when the row predates it.
 * Callers fall back to our order id in that case, which is exactly right for
 * Digicel and the only sane guess for an order created before this encoding.
 */
export function decodeMoncashProviderRef(ref: string | null | undefined): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return null;
  const rest = ref.slice(REF_PREFIX.length);
  const localeSep = rest.indexOf(':');
  if (localeSep === -1) return null; // "<locale>" only — no ref at all
  const afterLocale = rest.slice(localeSep + 1); // "<providerRef>" or "<providerId>:<providerRef>"
  const idSep = afterLocale.indexOf(':');
  if (idSep !== -1 && isProviderId(afterLocale.slice(0, idSep))) {
    return afterLocale.slice(idSep + 1).trim() || null;
  }
  return afterLocale.trim() || null; // legacy two-part row — no providerId segment
}

/**
 * Pure — which provider created this order, or null when the row predates
 * that being recorded (every row from before this fix, and any row with no
 * providerRef at all). `settleMoncashOrder` treats null as "use the old
 * env-driven pick" via `retrieveMoncashOrderFrom`.
 */
export function decodeMoncashProviderId(ref: string | null | undefined): MoncashProviderId | null {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) return null;
  const rest = ref.slice(REF_PREFIX.length);
  const localeSep = rest.indexOf(':');
  if (localeSep === -1) return null;
  const afterLocale = rest.slice(localeSep + 1);
  const idSep = afterLocale.indexOf(':');
  if (idSep === -1) return null;
  const maybeId = afterLocale.slice(0, idSep);
  return isProviderId(maybeId) ? maybeId : null;
}

/** True when this checkout row was started through MonCash rather than Stripe. */
export function isMoncashRef(ref: string | null | undefined): boolean {
  return typeof ref === 'string' && ref.startsWith(REF_PREFIX);
}

export type SettleResult =
  | { status: 'granted' | 'already'; locale: 'ht' | 'fr'; courseSlug: string; courseCount?: number }
  | { status: 'unpaid' | 'unknown_order' | 'not_configured' | 'error'; locale: 'ht' | 'fr'; courseSlug?: string };

/**
 * Verifies `orderId` against MonCash and, if it really was paid, grants
 * access. NEVER THROWS — callers are HTTP endpoints that must answer calmly
 * even when MonCash or the DB is having a bad minute.
 */
/** One checkout row, as settlement needs it. */
type SettleRow = {
  id: string;
  userId: string | null;
  courseSlug: string | null;
  amountCents: number;
  sessionId: string | null;
  completedAt: Date | null;
};

const SETTLE_COLUMNS = {
  id: checkoutSessions.id,
  userId: checkoutSessions.userId,
  courseSlug: checkoutSessions.courseSlug,
  amountCents: checkoutSessions.amountCents,
  sessionId: checkoutSessions.sessionId,
  completedAt: checkoutSessions.completedAt,
};

/**
 * Every checkout row `orderId` stands for: the single row whose own id it
 * is, OR every row of the basket whose cartId it is (« panye », migration
 * 0021 — the wallets take one payment for a whole basket, so the CART id is
 * what travels to the gateway).
 *
 * The cart lookup is wrapped separately because a live DB that still lags
 * the migration throws on the `cart_id` column — and on such a DB no cart
 * can exist (checkout refuses baskets without the column), so "no rows" is
 * the truthful answer, not an error.
 */
async function settleRowsFor(orderId: string): Promise<SettleRow[]> {
  const byId = await db
    .select(SETTLE_COLUMNS)
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, orderId))
    .limit(1);
  if (byId.length > 0) return byId;
  try {
    return await db
      .select(SETTLE_COLUMNS)
      .from(checkoutSessions)
      .where(eq(checkoutSessions.cartId, orderId));
  } catch {
    return [];
  }
}

export async function settleMoncashOrder(orderId: string): Promise<SettleResult> {
  if (!moncashConfigured() || !process.env.DATABASE_URL) {
    return { status: 'not_configured', locale: 'ht' };
  }
  try {
    const rows = (await settleRowsFor(orderId)).filter((r) => r.userId && r.courseSlug);
    if (rows.length === 0) {
      await logMoncashFailure(orderId, 'order.unknown', 'checkout_sessions row not found or incomplete');
      return { status: 'unknown_order', locale: 'ht' };
    }
    // Basket rows were written in one INSERT with identical refs — any row
    // speaks for the order. Locale too: one buyer, one basket, one language.
    const first = rows[0];
    const locale = decodeMoncashLocale(first.sessionId);

    // Verify by the PROVIDER's reference when we have one. Digicel answers to
    // our own order id, but Bazik only answers to the `BZK_…` id it minted, so
    // assuming our id here would make every Bazik payment unverifiable.
    const providerRef = decodeMoncashProviderRef(first.sessionId) ?? orderId;
    // Ask the SAME provider that created the order, not whichever one the
    // current env resolves to — see `retrieveMoncashOrderFrom`'s header.
    const providerId = decodeMoncashProviderId(first.sessionId);

    const remote = await retrieveWithRetry(providerId, providerRef);
    if (!remote.ok) {
      console.error('[moncash/order] retrieval failed:', remote.message);
      await logMoncashFailure(orderId, 'order.retrieve', remote.message);
      return { status: 'error', locale, courseSlug: first.courseSlug! };
    }
    if (!remote.paid) {
      // Abandoned or still pending. Not an error — the buyer may simply have
      // backed out; nothing is granted and nothing is recorded.
      return { status: 'unpaid', locale, courseSlug: first.courseSlug! };
    }

    // ONE payment verified → one fulfilment PER COURSE, each through the
    // same idempotent single-course path (its own payments row keyed on the
    // ROW id, its own enrollment, its own teacher's 70%). The gourdes the
    // provider reports for the whole basket are allocated per course so
    // every receipt shows a real figure and the shares sum to the debit
    // (lib/payments/cart.ts). Sequential on purpose — these share DB
    // connections inside one webhook invocation.
    const shares = allocateHtgShares(remote.amountHtg ?? 0, rows.map((r) => r.amountCents));
    let processed = 0;
    let already = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const outcome = await fulfillMoncashOrder({
        orderId: row.id,
        userDbId: row.userId!,
        courseSlug: row.courseSlug!,
        // This course's exact share of what MonCash took; 0 ⇒ the receipt's
        // estimate path, same as a provider that disclosed nothing.
        amountHtg: shares[i],
        usdCentsEquivalent: row.amountCents,
        transactionId: remote.transactionId,
        locale,
      });
      if (outcome === 'error') {
        // Stop the tally but DON'T abort the loop: the remaining courses'
        // money already moved, and each fulfilment is independent. The
        // webhook log + reconcile cron re-drive whatever failed here.
        await logMoncashFailure(row.id, 'order.fulfill', 'fulfillMoncashOrder returned error');
        return { status: 'error', locale, courseSlug: row.courseSlug! };
      }
      if (outcome === 'processed') processed += 1;
      else already += 1;
    }

    // Mark every row closed so the abandoned-cart cron stops chasing them.
    // Best effort and idempotent; access has already been granted above.
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
    console.error('[moncash/order] settle failed:', message);
    await logMoncashFailure(orderId, 'order.settle', message);
    return { status: 'error', locale: 'ht' };
  }
}
