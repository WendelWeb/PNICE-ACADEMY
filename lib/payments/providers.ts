/**
 * lib/payments/providers.ts — the ONE payment-truth source for what the site
 * may CLAIM to accept (Stage: durable site content).
 *
 * `activeProviders()` = the admin's DB-backed provider toggles
 * (platform_settings.providers_json, lib/admin/platform/store.ts) ∩ the
 * rails that are ACTUALLY implemented end-to-end today — currently card
 * only, via Stripe. Public trust surfaces (the footer's "payments" badge
 * row, the checkout "we accept" badge list) consume THIS module, and since
 * Stage: checkout honesty the checkout method SELECTOR does too
 * (components/checkout/PaymentMethods.tsx renders only `live` from
 * `splitProviders` below — toggled-but-unbuilt rails appear solely as
 * non-interactive "Byento" chips). A rail that is toggled on but not yet
 * built — or built but toggled off — is never advertised or selectable.
 * When a new rail goes live, add it to IMPLEMENTED_PROVIDERS and every
 * claim updates together.
 *
 * NEVER-THROW: the underlying toggle read is gated + never-throw (defaults:
 * all toggles on), so with no DB this resolves to the implemented list.
 */
import { activeProviders as toggledProviders } from '@/lib/admin/platform/store';
import type { ProviderKey } from '@/lib/admin/platform/keys';
import { moncashConfigured, moncashMode } from './moncash';
import { hasCap } from '@/lib/admin/guard';

/**
 * Rails with a real, live charge path. Card = Stripe checkout, always built.
 *
 * MonCash is CONDITIONALLY implemented: the code path exists end to end
 * (lib/payments/moncash.ts + /api/checkout/moncash + both callbacks), but it
 * can only charge anybody once the owner's Digicel merchant credentials are
 * set. Advertising it before then would be exactly the "demo rail on the money
 * page" dishonesty this module exists to prevent — so it joins the list only
 * when `moncashConfigured()` is true, and the site's claims follow
 * automatically, everywhere, with no other edit.
 */
export function implementedProviders(): ProviderKey[] {
  const list: ProviderKey[] = ['card'];
  if (moncashSellable()) list.push('moncash');
  return list;
}

/**
 * MonCash may be OFFERED TO THE PUBLIC only when it is configured AND not
 * pointed at the sandbox on a production deployment.
 *
 * That second half is the important one. Sandbox credentials move no real
 * money, but this app grants course access on MonCash's word — so a sandbox
 * rail exposed on the live site would hand out paid courses for nothing. The
 * check is deliberately positive ("live mode, or not a production deploy")
 * rather than a blocklist, so a missing/misspelled MONCASH_MODE fails closed.
 */
export function moncashSellable(): boolean {
  if (!moncashConfigured()) return false;
  if (moncashMode() === 'live') return true;
  return process.env.VERCEL_ENV !== 'production';
}

/**
 * What the CHECKOUT SELECTOR may offer — `moncashSellable()` plus one
 * deliberate exception: the owner may pay with a sandbox MonCash on the real
 * production site.
 *
 * WHY THE EXCEPTION EXISTS: without it, the only way to rehearse a complete
 * MonCash purchase — checkout, Digicel's gateway, the callbacks, enrolment,
 * the receipt — is to point real credentials at real money. Letting the owner
 * (and only the owner) walk the flow with fake money on the real site is the
 * safer of the two, by a wide margin.
 *
 * WHY IT IS SEPARATE FROM `activeProviders()`: public trust surfaces — the
 * footer's "we accept" row, the checkout badges — must say the same thing to
 * everyone. Folding a per-viewer exception into that source would make the
 * site claim MonCash is accepted merely because the owner happened to be
 * signed in. The exception belongs to the selector, and nowhere else.
 */
export async function checkoutProviders(): Promise<ProviderKey[]> {
  const list: ProviderKey[] = ['card'];
  if (moncashSellable()) {
    list.push('moncash');
  } else if (moncashConfigured() && (await hasCap('roles.manage'))) {
    // Sandbox on production, owner only — a rehearsal, not a sale.
    list.push('moncash');
  }
  return list;
}

/** @deprecated Use `implementedProviders()` — kept so older imports still resolve. */
export const IMPLEMENTED_PROVIDERS: ProviderKey[] = ['card'];

/** Canonical display labels — brand names, identical in ht/fr. */
export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  card: 'Visa / Mastercard',
  paypal: 'PayPal',
  moncash: 'MonCash',
  natcash: 'NatCash',
  crypto: 'Crypto',
};

/** Admin toggles ∩ implemented rails — what the site may claim to accept. */
export async function activeProviders(): Promise<ProviderKey[]> {
  const toggled = await toggledProviders();
  return implementedProviders().filter((k) => toggled.includes(k));
}

/** The same list as display labels, for badge rows. */
export async function activeProviderLabels(): Promise<string[]> {
  return (await activeProviders()).map((k) => PROVIDER_LABELS[k]);
}

/**
 * Split the admin's toggled rails into what checkout may SELL today vs what
 * it may only ANNOUNCE (Stage: checkout honesty). Pure — the async DB read
 * stays in `activeProviders`; this is the one testable rule:
 *   - `live`      = toggled ∩ implemented → the ONLY selectable methods, in
 *                   IMPLEMENTED_PROVIDERS order (a rail nobody can charge
 *                   through must never render a radio row).
 *   - `comingSoon`= toggled ∖ implemented → small non-interactive "Byento"
 *                   chips, in the toggles' own order. Toggling a future rail
 *                   OFF removes even its chip.
 */
export function splitProviders(
  toggled: ProviderKey[],
  /** Injected so this stays PURE and testable — callers pass
   *  `implementedProviders()`, which reads env. Defaults to it for
   *  convenience at real call sites. */
  implemented: ProviderKey[] = implementedProviders(),
): {
  live: ProviderKey[];
  comingSoon: ProviderKey[];
} {
  return {
    live: implemented.filter((k) => toggled.includes(k)),
    comingSoon: toggled.filter((k) => !implemented.includes(k)),
  };
}
