/**
 * lib/payments/moncash.ts — the MonCash facade: picks a provider, then gets
 * out of the way.
 *
 * MonCash can be reached two ways and which one is available depends on
 * paperwork, not on code:
 *
 *   - `direct` — Digicel's own API. No middleman, no aggregator fee, but it
 *                needs a Digicel merchant contract that takes weeks.
 *   - `bazik`  — Bazik (api.bazik.io), a Haitian aggregator fronting MonCash
 *                with self-serve credentials, so it can be live today.
 *
 * Everything downstream — the checkout route, both callbacks, fulfilment, the
 * admin probe — imports from HERE and never learns which one answered.
 * Switching is `MONCASH_PROVIDER=direct|bazik`, not a refactor.
 *
 * SELECTION RULE (`activeMoncashProvider`): honour MONCASH_PROVIDER when it
 * names a provider that is actually configured; otherwise fall back to
 * whichever one has credentials, preferring `direct` because it is the
 * cheaper path when both exist. Naming an unconfigured provider does NOT
 * silently use the other one — it resolves to null, so a typo surfaces as
 * "MonCash not configured" instead of quietly charging through a different
 * company than intended.
 */
import { directProvider, directHost, directMode, directRedirectUrl, directBasicAuth, isDirectPaid, resetDirectTokenCache } from './moncash/direct';
import { bazikProvider, bazikMode, isBazikPaid, resetBazikTokenCache } from './moncash/bazik';
import type {
  MoncashCreateInput,
  MoncashFailure,
  MoncashMode,
  MoncashOrder,
  MoncashPayment,
  MoncashProvider,
  MoncashProviderId,
} from './moncash/types';

export type { MoncashMode, MoncashFailure, MoncashOrder, MoncashPayment, MoncashProviderId };
export { usdCentsToHtg, MONCASH_MAX_HTG } from './moncash/types';

/** Both implementations, in preference order for the fallback below. */
const PROVIDERS: MoncashProvider[] = [directProvider, bazikProvider];

/** Pure — the selection rule, exported so it can be tested without env juggling. */
export function pickMoncashProvider(
  requested: string | undefined,
  configured: Record<MoncashProviderId, boolean>,
): MoncashProviderId | null {
  const want = requested?.trim().toLowerCase();
  if (want === 'direct' || want === 'bazik') {
    // Explicit choice is honoured or refused — never silently redirected to
    // the other provider, which would mean charging through a different
    // company than the operator asked for.
    return configured[want] ? want : null;
  }
  if (configured.direct) return 'direct';
  if (configured.bazik) return 'bazik';
  return null;
}

/** The provider in force right now, or null when none is usable. */
export function activeMoncashProvider(): MoncashProvider | null {
  const id = pickMoncashProvider(process.env.MONCASH_PROVIDER, {
    direct: directProvider.configured(),
    bazik: bazikProvider.configured(),
  });
  return id ? (PROVIDERS.find((p) => p.id === id) ?? null) : null;
}

/** True when SOME provider can take a MonCash payment. */
export function moncashConfigured(): boolean {
  return activeMoncashProvider() !== null;
}

/** Which environment the active provider points at; 'sandbox' when none. */
export function moncashMode(): MoncashMode {
  return activeMoncashProvider()?.mode() ?? 'sandbox';
}

/** Human-readable target, for the admin diagnostic page. */
export function moncashLabel(): string {
  return activeMoncashProvider()?.label() ?? 'aucun fournisseur configuré';
}

export function moncashProviderId(): MoncashProviderId | null {
  return activeMoncashProvider()?.id ?? null;
}

/**
 * Creates a MonCash order through the active provider.
 *
 * The returned `providerRef` is what MUST be persisted to verify later — it is
 * our own order id for Digicel but Bazik's minted `BZK_…` id for Bazik, so a
 * caller that assumes it can re-derive it will silently break on a switch.
 */
export async function createMoncashOrder(
  input: MoncashCreateInput,
): Promise<MoncashOrder | MoncashFailure> {
  const provider = activeMoncashProvider();
  if (!provider) return { ok: false, message: 'not_configured' };
  return provider.createOrder(input);
}

/** Asks the active provider whether `providerRef` was actually paid. */
export async function retrieveMoncashOrder(
  providerRef: string,
): Promise<MoncashPayment | MoncashFailure> {
  const provider = activeMoncashProvider();
  if (!provider) return { ok: false, message: 'not_configured' };
  return provider.checkOrder(providerRef);
}

/**
 * Asks a SPECIFIC provider whether `providerRef` was paid, instead of
 * whichever one `activeMoncashProvider()` resolves to right now.
 *
 * WHY THIS EXISTS: `checkout_sessions` persists which provider actually
 * created an order (see `encodeMoncashRef`'s `providerId` argument). Digicel
 * and Bazik mint incompatible reference formats and neither recognises the
 * other's — so if the env-driven default (`MONCASH_PROVIDER` unset,
 * credentials added/rotated) changes between order-creation and settlement,
 * verifying through `retrieveMoncashOrder`'s fresh `activeMoncashProvider()`
 * would ask the WRONG company about a real, paid order and get back "not
 * found" for it. This asks the one that actually minted the reference.
 *
 * `providerId: null` is the legacy path — an order row encoded before this
 * function existed, which never recorded which provider created it. There is
 * no way to recover that after the fact, so this falls back to the old
 * env-driven behaviour (`retrieveMoncashOrder`), same as before this fix.
 */
export async function retrieveMoncashOrderFrom(
  providerId: MoncashProviderId | null,
  providerRef: string,
): Promise<MoncashPayment | MoncashFailure> {
  if (!providerId) return retrieveMoncashOrder(providerRef);
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider || !provider.configured()) {
    // Never silently ask the OTHER provider — same rule as
    // `pickMoncashProvider`. The order was created through `providerId`; if
    // that one is gone, the honest answer is "can't verify", not a
    // false-negative from asking a company that never saw this payment.
    return { ok: false, message: 'order_provider_unavailable' };
  }
  return provider.checkOrder(providerRef);
}

/* ---------------------- direct-provider specifics ------------------------ */
/* Re-exported because the admin diagnostic page and the existing unit tests
 * reason about Digicel's own hosts and redirect URLs. Nothing in the checkout
 * path uses these — they are provider-specific by nature. */
export {
  directHost as moncashHost,
  directRedirectUrl as moncashRedirectUrl,
  directBasicAuth as moncashBasicAuth,
  isDirectPaid as isMoncashPaid,
  directMode,
  bazikMode,
  isBazikPaid,
};

/** Test seam: clear every provider's cached bearer. */
export function resetMoncashTokenCache(): void {
  resetDirectTokenCache();
  resetBazikTokenCache();
}
