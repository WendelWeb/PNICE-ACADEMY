/**
 * lib/payments/moncash/types.ts — the contract every MonCash provider honours.
 *
 * WHY THERE IS MORE THAN ONE PROVIDER: MonCash can be reached two ways, and
 * which one is available depends on paperwork, not on code.
 *
 *   - `direct`  — Digicel's own REST API. No middleman and no extra fee, but
 *                 it needs a Digicel merchant contract, which takes weeks.
 *   - `bazik`   — Bazik (api.bazik.io), a Haitian aggregator that fronts
 *                 MonCash. Self-serve credentials, so it can be live today.
 *
 * They are deliberately behind ONE interface so the rest of the app — the
 * checkout route, the callbacks, fulfilment, the admin probe — never learns
 * which one is in use. Switching is an env var, not a refactor.
 *
 * THE SHAPE ITSELF IS NOT MONCASH-SPECIFIC. NatCash works the same way, so the
 * order/payment/failure shapes and the USD→HTG arithmetic live in
 * lib/payments/gateway.ts and are re-exported here under their long-standing
 * MonCash names. One definition of what a buyer is debited, two rails.
 */
export type {
  GatewayMode as MoncashMode,
  GatewayFailure as MoncashFailure,
  GatewayOrder as MoncashOrderBase,
  GatewayPayment as MoncashPayment,
  GatewayCreateInput as MoncashCreateInput,
} from '../gateway';
export { usdCentsToHtg, HTG_WALLET_MAX as MONCASH_MAX_HTG } from '../gateway';

import type { GatewayCreateInput, GatewayFailure, GatewayMode, GatewayOrder, GatewayPayment } from '../gateway';

export type MoncashProviderId = 'direct' | 'bazik';

/**
 * A created MonCash order. Same as the rail-neutral shape plus `provider`,
 * which callers persist so settlement asks the SAME company back — Digicel and
 * Bazik mint incompatible references and neither recognises the other's.
 */
export type MoncashOrder = GatewayOrder & { provider: MoncashProviderId };

/**
 * Every provider implements exactly this. NEVER-THROW is part of the contract,
 * not a nicety: these run inside checkout requests and webhook handlers that
 * must answer calmly when Haiti's payment infrastructure has a bad minute.
 */
export type MoncashProvider = {
  id: MoncashProviderId;
  /** True once this provider's own credentials are present. */
  configured(): boolean;
  /** Which environment the current credentials point at. */
  mode(): GatewayMode;
  /** Human-readable target, for the admin diagnostic page. */
  label(): string;
  createOrder(input: GatewayCreateInput): Promise<MoncashOrder | GatewayFailure>;
  /** `providerRef` is whatever `createOrder` returned. */
  checkOrder(providerRef: string): Promise<GatewayPayment | GatewayFailure>;
};
