/**
 * Tests for the ONE payment-truth source (lib/payments/providers.ts).
 *
 * Since the wallets-first decision (août 2026) EVERY rail is conditional on
 * its own gate — nothing is "always implemented" any more. The test env has
 * no provider credentials at all (vitest doesn't load .env.local), so the
 * baseline truth here is: NOTHING is sellable, and the site claims nothing.
 * Each gate is then exercised explicitly via stubbed env.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  activeProviders,
  activeProviderLabels,
  splitProviders,
  implementedProviders,
  cardSellable,
  PROVIDER_LABELS,
} from './providers';
import { PROVIDER_KEYS } from '@/lib/admin/platform/keys';

afterEach(() => vi.unstubAllEnvs());

describe('cardSellable — a key that cannot charge a real card must not sell', () => {
  it('no Stripe key at all ⇒ not sellable', () => {
    expect(cardSellable()).toBe(false);
  });

  it('LIVE key ⇒ sellable, even on production', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_x');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(cardSellable()).toBe(true);
  });

  /**
   * THE BUG THIS GATE EXISTS FOR: production ran with an `sk_test_` key while
   * the selector offered Visa/Mastercard to real buyers — whose real cards a
   * test-mode Stripe session can only refuse. A test key on production is an
   * announcement ("Byento"), never a selectable method.
   */
  it('TEST key on production ⇒ NOT sellable', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(cardSellable()).toBe(false);
  });

  it('TEST key outside production (dev/preview) ⇒ sellable, so the flow stays rehearsable', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    expect(cardSellable()).toBe(true);
  });
});

describe('implementedProviders — every rail behind its own gate', () => {
  it('claims NOTHING when no provider is configured', () => {
    expect(implementedProviders()).toEqual([]);
  });

  it('mobile money leads the order when present alongside card', () => {
    // Bazik credentials (MonCash) + a live Stripe key: the wallet a Haitian
    // audience already uses must be listed — and thus pre-selected — first.
    vi.stubEnv('BAZIK_USER_ID', 'bzk_live_x');
    vi.stubEnv('BAZIK_SECRET_KEY', 'sk_x');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_x');
    const rails = implementedProviders();
    expect(rails[0]).toBe('moncash');
    expect(rails).toContain('card');
  });
});

describe('activeProviders / labels — the public claims', () => {
  it('claims no rail when nothing can actually charge', async () => {
    expect(await activeProviders()).toEqual([]);
    expect(await activeProviderLabels()).toEqual([]);
  });

  it('has a display label ready for every provider key (future rails included)', () => {
    for (const k of PROVIDER_KEYS) {
      expect(PROVIDER_LABELS[k]).toBeTruthy();
    }
  });
});

// Stage: checkout honesty — the method selector renders ONLY `live` (rails
// that really charge); everything else toggled on becomes a non-interactive
// "Byento" chip. Pure rule: `implemented` is injected.
describe('splitProviders — sellable vs announced', () => {
  it('wallets-first launch: wallets live, card among the Byento chips', () => {
    const { live, comingSoon } = splitProviders([...PROVIDER_KEYS], ['moncash', 'natcash']);
    expect(live).toEqual(['moncash', 'natcash']);
    expect(comingSoon).toContain('card');
    expect(comingSoon).toContain('paypal');
  });

  it('an unimplemented rail can NEVER become selectable, whatever the toggles say', () => {
    const { live } = splitProviders(['moncash', 'natcash', 'paypal', 'crypto', 'card'], ['moncash']);
    expect(live).toEqual(['moncash']);
  });

  it('toggling a rail off removes even its coming-soon chip', () => {
    const { comingSoon } = splitProviders(['card', 'moncash'], []);
    expect(comingSoon).toEqual(['card', 'moncash']);
  });

  it('the day the live Stripe key lands, card rejoins the selectable rails with no other change', () => {
    const before = splitProviders([...PROVIDER_KEYS], ['moncash', 'natcash']);
    const after = splitProviders([...PROVIDER_KEYS], ['moncash', 'natcash', 'card']);
    expect(before.live).not.toContain('card');
    expect(after.live).toContain('card');
    expect(after.comingSoon).not.toContain('card');
  });

  it('everything toggled off leaves no live methods (page shows its no-methods state)', () => {
    const { live, comingSoon } = splitProviders([], ['moncash']);
    expect(live).toEqual([]);
    expect(comingSoon).toEqual([]);
  });
});
