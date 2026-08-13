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
 * THE SHAPE IS THE SAME FOR BOTH because MonCash itself imposes it: create an
 * order, send the buyer to a hosted page, then ask afterwards whether the money
 * moved. Only the credentials, the URLs and the field names differ.
 */
import { toHtgAt } from '@/lib/money';

export type MoncashMode = 'sandbox' | 'live';
export type MoncashProviderId = 'direct' | 'bazik';
export type MoncashFailure = { ok: false; message: string };

/** A created order, ready for the buyer's browser. */
export type MoncashOrder = {
  ok: true;
  /** Where to send the buyer to pay. */
  redirectUrl: string;
  /**
   * What THIS provider needs to look the payment up later.
   *
   * It is NOT always our own order id: Digicel looks a payment up by the
   * `orderId` we chose, while Bazik mints its own (`BZK_sandbox_…`) and
   * verifies by that. Callers must therefore persist whatever comes back here
   * rather than assuming they can re-derive it — see `encodeMoncashRef`.
   */
  providerRef: string;
  mode: MoncashMode;
  provider: MoncashProviderId;
};

/** What a provider reports about an order after the fact. */
export type MoncashPayment = {
  ok: true;
  /** True only when the provider says the money actually moved. */
  paid: boolean;
  /** The provider's own transaction id, for support and reconciliation. */
  transactionId: string | null;
  /** Gourdes the provider reports as charged. */
  amountHtg: number | null;
  /** The paying wallet, when the provider discloses it. */
  payer: string | null;
  raw: unknown;
};

export type MoncashCreateInput = {
  /** OUR reference — the checkout_sessions row id. Always sent to the provider. */
  orderId: string;
  /** Whole gourdes. MonCash has no sub-unit. */
  amountHtg: number;
  /** Shown to the buyer on the provider's page, when it supports a label. */
  description?: string;
  /**
   * Where to send the buyer back. Bazik takes these per request; Digicel
   * ignores them because its return URLs are fixed in the merchant portal.
   * Passing them always keeps the call sites provider-agnostic.
   */
  successUrl?: string;
  errorUrl?: string;
  /** Same story: honoured by Bazik, fixed in the portal for Digicel. */
  webhookUrl?: string;
};

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
  mode(): MoncashMode;
  /** Human-readable target, for the admin diagnostic page. */
  label(): string;
  createOrder(input: MoncashCreateInput): Promise<MoncashOrder | MoncashFailure>;
  /** `providerRef` is whatever `createOrder` returned. */
  checkOrder(providerRef: string): Promise<MoncashPayment | MoncashFailure>;
};

/**
 * Pure — USD cents to whole gourdes at `rate`. Rounds to the nearest gourde
 * because MonCash has no sub-unit: a fractional amount is silently truncated
 * by the gateway, so the rounding is explicit and testable here. Always at
 * least 1 gourde for any non-zero price — a paid course must never become free
 * through a rounding accident.
 *
 * DELEGATES to lib/money.ts's `toHtgAt`, which is the app's only USD→HTG
 * rule. That is not tidiness: this function computes what the buyer is
 * actually DEBITED, and `toHtgAt` computes what every page ADVERTISES. When
 * they were two separate implementations they disagreed — a $2 course showed
 * "~250 HTG" (rounded to the nearest 50) and charged 270 (rounded to the
 * nearest 1). One function, one number, by construction.
 */
export function usdCentsToHtg(amountCents: number, rate: number): number {
  if (!Number.isFinite(amountCents) || !Number.isFinite(rate) || amountCents <= 0 || rate <= 0) return 0;
  return Math.max(1, toHtgAt(amountCents / 100, rate));
}

/**
 * MonCash refuses anything above 75 000 HTG in a single transaction (stated by
 * Bazik, and a limit of the underlying wallet rather than of any one
 * integrator — so it is enforced for every provider). Checked before the
 * network call so an over-limit cart fails with a clear reason instead of a
 * provider-specific error the buyer cannot act on.
 */
export const MONCASH_MAX_HTG = 75_000;
