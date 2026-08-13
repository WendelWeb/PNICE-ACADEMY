/**
 * Unit tests for lib/admin/data/real/marketing.ts's `attemptRailOf` — the
 * pure rail/provider-order-created derivation behind /admin/transactions'
 * "purchase attempts" panel (getPurchaseAttempts).
 *
 * `attemptRailOf` deliberately duplicates lib/payments/moncash-order.ts's
 * `moncash:<locale>[:<providerRef>]` encoding as a tiny local string check
 * instead of importing that module (see attemptRailOf's own doc comment for
 * the client-bundle-boundary reason). This test cross-checks it against the
 * REAL `encodeMoncashRef`/`decodeMoncashProviderRef` so the two can never
 * silently drift apart — a test file has no client-bundle boundary, so the
 * cross-import is safe here even though it isn't in the source module.
 */
import { describe, it, expect } from 'vitest';
import { attemptRailOf } from './marketing';
import { encodeMoncashRef, decodeMoncashProviderRef, isMoncashRef } from '@/lib/payments/moncash-order';

describe('attemptRailOf', () => {
  it('reads a Stripe row (non-moncash sessionId) as card, provider order created', () => {
    expect(attemptRailOf('cs_test_abc123')).toEqual({ rail: 'card', providerOrderCreated: true });
  });

  it('a Stripe row with sessionId still null (Stripe call never succeeded) reads as card, no order created', () => {
    expect(attemptRailOf(null)).toEqual({ rail: 'card', providerOrderCreated: false });
  });

  it('a MonCash order created before Bazik/Digicel ever answered (no providerRef yet) reads as no order created', () => {
    const ref = encodeMoncashRef('ht');
    expect(attemptRailOf(ref)).toEqual({ rail: 'moncash', providerOrderCreated: false });
  });

  it('a MonCash order the provider actually accepted (providerRef present) reads as order created', () => {
    const ref = encodeMoncashRef('fr', 'BZK_sandbox_abc123');
    expect(attemptRailOf(ref)).toEqual({ rail: 'moncash', providerOrderCreated: true });
  });

  it('agrees with isMoncashRef/decodeMoncashProviderRef across both encodings', () => {
    for (const ref of [encodeMoncashRef('ht'), encodeMoncashRef('fr', 'BZK_x'), 'cs_live_x', null]) {
      const result = attemptRailOf(ref);
      expect(result.rail).toBe(isMoncashRef(ref) ? 'moncash' : 'card');
      if (isMoncashRef(ref)) {
        expect(result.providerOrderCreated).toBe(decodeMoncashProviderRef(ref) !== null);
      }
    }
  });
});
