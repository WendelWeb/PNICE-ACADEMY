/**
 * lib/payments/gateway.ts — what every Haitian mobile-money rail has in common.
 *
 * MonCash and NatCash are different companies with different APIs, but from
 * this platform's side they are the same shape, because the underlying product
 * is the same: charge in WHOLE GOURDES, send the buyer to a hosted page, then
 * find out afterwards whether the money actually moved. Card payments (Stripe)
 * are NOT this shape — they settle synchronously and speak USD cents — which
 * is why this contract lives apart from lib/payments/fulfill.ts.
 *
 * Defining it once matters for one reason above all: `usdCentsToHtg` is the
 * arithmetic that decides what a buyer is DEBITED. Two rails computing that
 * two ways is how a page ends up advertising one figure and charging another
 * (see lib/money.ts's header for the time that actually happened).
 *
 * `lib/payments/moncash/types.ts` re-exports these under its own names so the
 * MonCash rail — which is live and taking real money — keeps compiling
 * untouched.
 */
import { toHtgAt } from '@/lib/money';

/** Which environment a rail's current credentials point at. */
export type GatewayMode = 'sandbox' | 'live';

/** Every failure is a message, never an exception — see `GatewayProvider`. */
export type GatewayFailure = { ok: false; message: string };

/** A created order, ready for the buyer's browser. */
export type GatewayOrder = {
  ok: true;
  /** Where to send the buyer to pay. */
  redirectUrl: string;
  /**
   * What THIS provider needs to look the payment up later.
   *
   * It is NOT always our own order id: Digicel looks a payment up by the id
   * WE chose, while Bazik and Kobara mint their own and only answer to that.
   * Callers must persist whatever comes back here rather than assuming they
   * can re-derive it.
   */
  providerRef: string;
  mode: GatewayMode;
};

/** What a provider reports about an order after the fact. */
export type GatewayPayment = {
  ok: true;
  /** True ONLY when the provider says the money actually moved. */
  paid: boolean;
  /** The provider's own transaction id, for support and reconciliation. */
  transactionId: string | null;
  /** Gourdes the provider reports as charged. */
  amountHtg: number | null;
  /** The paying wallet, when the provider discloses it. */
  payer: string | null;
  raw: unknown;
};

export type GatewayCreateInput = {
  /** OUR reference — the `checkout_sessions` row id. Always sent along. */
  orderId: string;
  /** Whole gourdes. Neither MonCash nor NatCash has a sub-unit. */
  amountHtg: number;
  /** Shown to the buyer on the provider's page, when it supports a label. */
  description?: string;
  /** Where to send the buyer back, and where to notify us. Providers that fix
   *  these in a merchant portal (Digicel) simply ignore them, which keeps
   *  call sites free of provider knowledge. */
  successUrl?: string;
  errorUrl?: string;
  webhookUrl?: string;
};

/**
 * Pure — USD cents to whole gourdes at `rate`.
 *
 * Rounds to the nearest gourde because there is no sub-unit: a fractional
 * amount is silently truncated by the gateway, so the rounding is explicit
 * and testable here. Always at least 1 gourde for any non-zero price — a paid
 * course must never become free through a rounding accident.
 *
 * DELEGATES to lib/money.ts's `toHtgAt`, the app's only USD→HTG rule, so what
 * a page ADVERTISES and what a buyer is DEBITED cannot drift apart.
 */
export function usdCentsToHtg(amountCents: number, rate: number): number {
  if (!Number.isFinite(amountCents) || !Number.isFinite(rate) || amountCents <= 0 || rate <= 0) return 0;
  return Math.max(1, toHtgAt(amountCents / 100, rate));
}

/**
 * Neither wallet accepts more than 75 000 HTG in a single transaction. Stated
 * by Bazik for MonCash, and a limit of the underlying wallet rather than of
 * any one integrator — so it is enforced for every provider on every rail.
 * Checked before the network call so an over-limit cart fails with a reason
 * the buyer can act on instead of a provider-specific error they cannot.
 */
export const HTG_WALLET_MAX = 75_000;
