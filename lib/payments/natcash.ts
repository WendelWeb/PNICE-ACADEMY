/**
 * lib/payments/natcash.ts — the NatCash facade.
 *
 * Mirrors lib/payments/moncash.ts on purpose: one module the checkout route,
 * the callbacks and the admin probe import from, with the provider behind it.
 * Today there is exactly one provider (Kobara); the indirection exists because
 * NatCash's own direct API needs a merchant contract, and when that arrives it
 * should slot in the way `direct` did beside `bazik` — an env var, not a
 * refactor.
 *
 * NatCash is a SEPARATE RAIL from MonCash, never a fallback for it. A buyer
 * who chose NatCash must not be quietly charged through MonCash, and vice
 * versa: the two are different wallets belonging to different companies, and
 * the buyer only has money in the one they picked.
 */
import {
  checkKobaraOrder,
  createKobaraOrder,
  kobaraConfigured,
  kobaraLabel,
  kobaraMode,
} from './natcash/kobara';
import type { GatewayCreateInput, GatewayFailure, GatewayMode, GatewayOrder, GatewayPayment } from './gateway';

export { usdCentsToHtg, HTG_WALLET_MAX } from './gateway';
export type { GatewayFailure, GatewayOrder, GatewayPayment, GatewayMode };

/** Which company actually moves the money on this rail. */
export type NatcashProviderId = 'kobara';

export function natcashConfigured(): boolean {
  return kobaraConfigured();
}

/** 'sandbox' when nothing is configured — nothing real can move either way. */
export function natcashMode(): GatewayMode {
  return natcashConfigured() ? kobaraMode() : 'sandbox';
}

/** Human-readable target, for the admin diagnostic page. */
export function natcashLabel(): string {
  return natcashConfigured() ? kobaraLabel() : 'aucun fournisseur configuré';
}

export function natcashProviderId(): NatcashProviderId | null {
  return natcashConfigured() ? 'kobara' : null;
}

/**
 * Creates a NatCash order. The returned `providerRef` is Kobara's own payment
 * id and is what MUST be persisted — it is not derivable from our order id.
 */
export async function createNatcashOrder(
  input: GatewayCreateInput,
): Promise<GatewayOrder | GatewayFailure> {
  if (!natcashConfigured()) return { ok: false, message: 'not_configured' };
  return createKobaraOrder(input);
}

/**
 * Asks the provider whether `providerRef` was paid.
 *
 * May legitimately answer `unsupported_by_provider` — Kobara documents no
 * retrieve endpoint (see the provider module's header). Callers must treat
 * that as "cannot tell", never as "not paid": on this rail the authority is
 * the signed webhook, and concluding "unpaid" from a missing endpoint would
 * send a buyer who already paid back to the checkout page to pay again.
 */
export async function retrieveNatcashOrder(
  providerRef: string,
): Promise<GatewayPayment | GatewayFailure> {
  if (!natcashConfigured()) return { ok: false, message: 'not_configured' };
  return checkKobaraOrder(providerRef);
}
