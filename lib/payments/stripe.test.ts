import { describe, it, expect } from 'vitest';
import { stripeFormEncode } from '@/lib/payments/stripe';

describe('stripeFormEncode', () => {
  it('encodes bracketed keys and skips null/undefined', () => {
    const s = stripeFormEncode({
      mode: 'payment',
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][unit_amount]': 900,
      skipMe: undefined,
      alsoSkip: null,
    });
    expect(s).toContain('mode=payment');
    expect(s).toContain(encodeURIComponent('line_items[0][quantity]') + '=1');
    expect(s).toContain(encodeURIComponent('line_items[0][price_data][unit_amount]') + '=900');
    expect(s).not.toContain('skipMe');
    expect(s).not.toContain('alsoSkip');
  });

  it('URL-encodes values', () => {
    expect(stripeFormEncode({ name: 'Zouti & kat' })).toBe('name=Zouti+%26+kat');
  });
});
