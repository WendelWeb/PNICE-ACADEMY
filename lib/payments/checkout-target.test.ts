/**
 * Tests for lib/payments/checkout-target.ts (Stage: checkout honesty) — the
 * page-level rule that killed the silent course→subscription morph: a
 * REQUESTED `?course=` slug that doesn't resolve is a 404, never a
 * platform-pass checkout.
 */
import { describe, it, expect } from 'vitest';
import { checkoutMode } from './checkout-target';

describe('checkoutMode', () => {
  it('a resolvable course slug sells the course', () => {
    expect(checkoutMode({ courseRequested: true, courseResolved: true })).toBe('course');
  });

  it('an unknown/unpublished course slug 404s — NEVER morphs into a subscription', () => {
    expect(checkoutMode({ courseRequested: true, courseResolved: false })).toBe('not_found');
  });

  it('no course param at all is the subscription checkout (unchanged entry points)', () => {
    expect(checkoutMode({ courseRequested: false, courseResolved: false })).toBe('subscription');
  });
});
