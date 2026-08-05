/**
 * Pending-checkout guard (launch review fix). The repurchase guard
 * (lib/learner/access.ts) only reads `enrollments`/`subscriptions` — rows
 * ONLY written by the webhook (lib/payments/fulfill.ts), asynchronously,
 * AFTER Stripe redirects the buyer. That leaves a real window where two
 * tabs, a retried POST, or a merely-slow webhook can create and pay for TWO
 * separate Stripe Checkout Sessions for the SAME item before the first
 * purchase's webhook has landed.
 *
 * This module is the PURE decision app/api/checkout/route.ts makes once it
 * has (a) this user's own most recent not-yet-completed `checkout_sessions`
 * row for the SAME product, and (b) that row's LIVE status straight from
 * Stripe (lib/payments/stripe.ts's `getStripeCheckoutSessionStatus`):
 *   - nothing pending, or Stripe says it already expired ⇒ proceed exactly
 *     as before this fix — mint a new session.
 *   - still 'open' (not yet paid, not yet expired) ⇒ hand back that SAME
 *     session's URL instead of minting a second live session for one item.
 *   - already 'complete' (paid — the webhook just hasn't landed yet) ⇒
 *     refuse. The repurchase guard itself will catch this exact request
 *     once fulfillment lands; charging a second time here would be the bug
 *     this guard exists to close.
 * A degraded/'unknown' lookup (no Stripe key, network failure, malformed
 * id) resolves the SAME as "nothing pending" — a broken guard must degrade
 * to today's behaviour, never block a legitimate purchase.
 */

export type PendingCheckoutStatus = { status: 'open' | 'complete' | 'expired' | 'unknown'; url: string | null };

export type PendingCheckoutDecision =
  | { action: 'proceed' }
  | { action: 'reuse'; url: string }
  | { action: 'block' };

/** Pure — exported for unit testing without DB/Stripe. */
export function decidePendingCheckout(pending: PendingCheckoutStatus | null): PendingCheckoutDecision {
  if (!pending) return { action: 'proceed' };
  if (pending.status === 'complete') return { action: 'block' };
  if (pending.status === 'open' && pending.url) return { action: 'reuse', url: pending.url };
  return { action: 'proceed' }; // 'expired', or a degraded 'unknown' lookup
}
