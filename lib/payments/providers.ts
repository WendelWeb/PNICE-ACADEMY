/**
 * lib/payments/providers.ts — the ONE payment-truth source for what the site
 * may CLAIM to accept (Stage: durable site content).
 *
 * `activeProviders()` = the admin's DB-backed provider toggles
 * (platform_settings.providers_json, lib/admin/platform/store.ts) ∩ the
 * rails that are ACTUALLY implemented end-to-end today — currently card
 * only, via Stripe (components/checkout/PaymentMethods.tsx's `isLive`;
 * MonCash/NatCash/PayPal/crypto are demo-only selections with no live
 * charge path). Public trust surfaces (the footer's "payments" badge row,
 * the checkout "we accept" badge list) consume THIS module, so a rail that
 * is toggled on but not yet built — or built but toggled off — is never
 * advertised. When a new rail goes live, add it to IMPLEMENTED_PROVIDERS
 * and every claim updates together.
 *
 * NEVER-THROW: the underlying toggle read is gated + never-throw (defaults:
 * all toggles on), so with no DB this resolves to the implemented list.
 */
import { activeProviders as toggledProviders } from '@/lib/admin/platform/store';
import type { ProviderKey } from '@/lib/admin/platform/keys';

/** Rails with a real, live charge path today. Card = Stripe checkout. */
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
  return IMPLEMENTED_PROVIDERS.filter((k) => toggled.includes(k));
}

/** The same list as display labels, for badge rows. */
export async function activeProviderLabels(): Promise<string[]> {
  return (await activeProviders()).map((k) => PROVIDER_LABELS[k]);
}
