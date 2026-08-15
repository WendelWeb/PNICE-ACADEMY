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
import { natcashConfigured, natcashMode } from './natcash';

/**
 * Card may be SOLD only when the Stripe key can actually charge a real card.
 *
 * This check did not exist for a long time because card was assumed to be
 * "always built" — and it is built, but BUILT is not LIVE. The production
 * deployment ran with an `sk_test_` key, so the checkout offered
 * Visa/Mastercard to real buyers whose real cards a test-mode Stripe session
 * can only refuse. The owner's decision (août 2026) is wallets-first: MonCash
 * and NatCash sell today, card is announced as "Byento" until a LIVE Stripe
 * key exists (Atlas path). This function is what makes that announcement
 * flip to a real, selectable rail automatically the day `sk_live_…` lands in
 * the environment — no code change, same as the MonCash/NatCash gates.
 *
 * Same shape as `moncashSellable`: live key, or any non-production deploy
 * (dev/preview may exercise the test rail freely).
 */
export function cardSellable(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return false;
  if (key.startsWith('sk_live_')) return true;
  return process.env.VERCEL_ENV !== 'production';
}

/**
 * Rails with a real, live charge path — EVERY rail is conditional now.
 *
 * Each one joins the list only when its own gate says it can actually take a
 * real buyer's money today: MonCash and NatCash when their gateway
 * credentials are live, card when the Stripe key is a LIVE key
 * (`cardSellable` — a test key on production used to slip through here and
 * offer Visa/Mastercard it could only refuse). Advertising a rail before its
 * gate opens is exactly the "demo rail on the money page" dishonesty this
 * module exists to prevent; the day a gate opens, every claim on the site
 * updates together, with no other edit.
 */
export function implementedProviders(): ProviderKey[] {
  // Same mobile-money-first order as `checkoutProviders()` so the badge rows
  // and the selector agree on which rail leads.
  return [
    ...(moncashSellable() ? (['moncash'] as ProviderKey[]) : []),
    ...(natcashSellable() ? (['natcash'] as ProviderKey[]) : []),
    ...(cardSellable() ? (['card'] as ProviderKey[]) : []),
  ];
}

/**
 * NatCash may be OFFERED TO THE PUBLIC on exactly the same terms as MonCash:
 * configured, and not pointed at a sandbox on a production deployment. Same
 * reasoning too — this app grants course access on the gateway's word, so a
 * sandbox rail on the live site would hand out paid courses for nothing. The
 * check is positive, so a missing or misspelled KOBARA_MODE fails closed.
 */
export function natcashSellable(): boolean {
  if (!natcashConfigured()) return false;
  if (natcashMode() === 'live') return true;
  return process.env.VERCEL_ENV !== 'production';
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
  // MonCash goes FIRST, so it is the default selection. The checkout selector
  // pre-selects methods[0], and for a Haitian audience the mobile wallet they
  // already use should be the path of least resistance — a card is the
  // fallback here, not the norm. Ordering is the whole mechanism: nothing
  // else needs to know which rail is "preferred".
  return [
    ...(moncashOfferable() ? (['moncash'] as ProviderKey[]) : []),
    ...(natcashSellable() ? (['natcash'] as ProviderKey[]) : []),
    ...(cardSellable() ? (['card'] as ProviderKey[]) : []),
  ];
}

/**
 * Whether the checkout may offer MonCash at all.
 *
 * `moncashSellable()` is the safe rule: live credentials, or any non-production
 * deploy. Beyond that the owner has DELIBERATELY enabled sandbox MonCash on
 * production so the full purchase flow can be rehearsed on the real site.
 *
 * WHAT THAT COSTS, stated plainly because it is not obvious: the sandbox is a
 * simulator. It reports "successful" for money that never moved, and this app
 * grants course access on MonCash's word — so while this is on, anyone who
 * picks MonCash receives a real course without paying. That is acceptable only
 * as a short, watched testing window, which is why `moncashSandboxNotice()`
 * makes it visible on the page instead of letting it run silently.
 *
 * It closes by itself: the moment MONCASH_MODE=live with live credentials,
 * `moncashSellable()` is true and this flag stops mattering.
 */
export function moncashOfferable(): boolean {
  if (moncashSellable()) return true;
  return moncashConfigured() && process.env.MONCASH_ALLOW_SANDBOX_CHECKOUT === 'true';
}

/**
 * True when the checkout is about to offer a MonCash that CANNOT actually take
 * money. The page shows a plain warning in that case — a buyer must never be
 * asked to pay through a simulator without being told.
 */
export function moncashSandboxNotice(): boolean {
  return moncashOfferable() && !moncashSellable();
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
