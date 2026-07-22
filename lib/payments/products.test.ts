import { describe, it, expect } from 'vitest';
import { resolveProduct } from '@/lib/payments/products';
import { courses } from '@/data/courses';
import { SUBSCRIPTION_USD } from '@/data/pricing';

describe('resolveProduct', () => {
  it('resolves the subscription at the canonical price', () => {
    const p = resolveProduct({ productType: 'subscription' });
    expect(p).not.toBeNull();
    expect(p!.amountCents).toBe(SUBSCRIPTION_USD * 100);
    expect(p!.courseSlug).toBeNull();
    expect(p!.productType).toBe('subscription');
  });

  it('resolves every catalog course with its own price in cents', () => {
    for (const c of courses) {
      const p = resolveProduct({ productType: 'course', courseSlug: c.slug });
      expect(p, c.slug).not.toBeNull();
      expect(p!.amountCents).toBe(Math.round(c.priceUsd * 100));
      expect(p!.nameFr).toBe(c.title_fr);
      expect(p!.nameHt).toBe(c.title_ht);
    }
  });

  it('returns null for an unknown slug and for course without slug', () => {
    expect(resolveProduct({ productType: 'course', courseSlug: 'nope' })).toBeNull();
    expect(resolveProduct({ productType: 'course' })).toBeNull();
  });
});
