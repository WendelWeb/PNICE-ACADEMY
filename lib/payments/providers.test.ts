/**
 * Tests for the ONE payment-truth source (lib/payments/providers.ts) —
 * Stage: durable site content. No DATABASE_URL in the test env (see
 * lib/payments/products.test.ts), so the toggle read exercises its gated
 * fallback (all toggles on) and the intersection with the implemented rails
 * is what gets asserted: today that is card only.
 */
import { describe, it, expect } from 'vitest';
import {
  activeProviders,
  activeProviderLabels,
  IMPLEMENTED_PROVIDERS,
  PROVIDER_LABELS,
} from './providers';
import { PROVIDER_KEYS } from '@/lib/admin/platform/keys';

describe('activeProviders — toggles ∩ implemented rails', () => {
  it('resolves to exactly the implemented rails with default toggles (card only today)', async () => {
    expect(await activeProviders()).toEqual(['card']);
  });

  it('never claims a rail that is not implemented, whatever the toggles say', async () => {
    const active = await activeProviders();
    for (const k of active) {
      expect(IMPLEMENTED_PROVIDERS).toContain(k);
    }
  });
});

describe('activeProviderLabels — the badge rows (footer + checkout)', () => {
  it('maps to the canonical display labels', async () => {
    expect(await activeProviderLabels()).toEqual(['Visa / Mastercard']);
  });

  it('has a label for every provider key (future rails included)', () => {
    for (const k of PROVIDER_KEYS) {
      expect(PROVIDER_LABELS[k]).toBeTruthy();
    }
  });
});
