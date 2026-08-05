/**
 * lib/payments/checkout-guard.ts (launch review fix) — the pure decision
 * behind the pending-checkout guard in app/api/checkout/route.ts. Pins:
 *  - nothing pending / an expired or degraded lookup ⇒ proceed as normal;
 *  - a still-open session ⇒ reuse its URL instead of minting a second one;
 *  - an already-complete session (paid, webhook not landed yet) ⇒ block.
 */
import { describe, it, expect } from 'vitest';
import { decidePendingCheckout } from './checkout-guard';

describe('decidePendingCheckout', () => {
  it('proceeds when nothing is pending', () => {
    expect(decidePendingCheckout(null)).toEqual({ action: 'proceed' });
  });

  it('reuses the existing URL when the session is still open', () => {
    expect(decidePendingCheckout({ status: 'open', url: 'https://checkout.stripe.com/cs_1' })).toEqual({
      action: 'reuse',
      url: 'https://checkout.stripe.com/cs_1',
    });
  });

  it('blocks when the session already completed — never charge twice', () => {
    expect(decidePendingCheckout({ status: 'complete', url: null })).toEqual({ action: 'block' });
    // Even if a url happened to come back, 'complete' always blocks.
    expect(decidePendingCheckout({ status: 'complete', url: 'https://checkout.stripe.com/cs_1' })).toEqual({
      action: 'block',
    });
  });

  it('proceeds when the session expired', () => {
    expect(decidePendingCheckout({ status: 'expired', url: null })).toEqual({ action: 'proceed' });
  });

  it('proceeds on a degraded/unknown lookup — never blocks a legitimate purchase', () => {
    expect(decidePendingCheckout({ status: 'unknown', url: null })).toEqual({ action: 'proceed' });
  });

  it('proceeds on an "open" status with no url — nothing usable to reuse', () => {
    expect(decidePendingCheckout({ status: 'open', url: null })).toEqual({ action: 'proceed' });
  });
});
