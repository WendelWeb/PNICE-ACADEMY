import { describe, it, expect } from 'vitest';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';

describe('parseCheckoutBody', () => {
  it('accepts a subscription request', () => {
    expect(parseCheckoutBody({ productType: 'subscription', locale: 'fr' }))
      .toEqual({ productType: 'subscription', courseSlug: null, locale: 'fr' });
  });

  it('accepts a course request and defaults locale to ht', () => {
    expect(parseCheckoutBody({ productType: 'course', courseSlug: 'abc' }))
      .toEqual({ productType: 'course', courseSlug: 'abc', locale: 'ht' });
  });

  it('rejects junk', () => {
    expect(parseCheckoutBody(null)).toBeNull();
    expect(parseCheckoutBody({})).toBeNull();
    expect(parseCheckoutBody({ productType: 'course' })).toBeNull();
    expect(parseCheckoutBody({ productType: 'course', courseSlug: '' })).toBeNull();
    expect(parseCheckoutBody({ productType: 'course', courseSlug: 'x'.repeat(101) })).toBeNull();
  });
});
