import { describe, it, expect } from 'vitest';
import { parseCheckoutBody } from '@/lib/payments/checkout-body';

describe('parseCheckoutBody', () => {
  it('accepts a subscription request', () => {
    expect(parseCheckoutBody({ productType: 'subscription', locale: 'fr' }))
      .toEqual({ productType: 'subscription', courseSlug: null, teacherSlug: null, locale: 'fr' });
  });

  it('accepts a course request and defaults locale to ht', () => {
    expect(parseCheckoutBody({ productType: 'course', courseSlug: 'abc' }))
      .toEqual({ productType: 'course', courseSlug: 'abc', teacherSlug: null, locale: 'ht' });
  });

  it('rejects junk', () => {
    expect(parseCheckoutBody(null)).toBeNull();
    expect(parseCheckoutBody({})).toBeNull();
    expect(parseCheckoutBody({ productType: 'course' })).toBeNull();
    expect(parseCheckoutBody({ productType: 'course', courseSlug: '' })).toBeNull();
    expect(parseCheckoutBody({ productType: 'course', courseSlug: 'x'.repeat(101) })).toBeNull();
  });

  // Task: per-teacher subscription checkout — `/prof/[slug]`'s CTA carries
  // its own slug through this body so `/api/checkout` charges THAT teacher's
  // plan instead of always the platform default.
  describe('teacherSlug (subscription only)', () => {
    it('carries a valid teacherSlug through for a subscription request', () => {
      expect(parseCheckoutBody({ productType: 'subscription', teacherSlug: 'pnice-academy', locale: 'ht' }))
        .toEqual({ productType: 'subscription', courseSlug: null, teacherSlug: 'pnice-academy', locale: 'ht' });
    });

    it('a subscription request with no teacherSlug still resolves (platform default)', () => {
      const r = parseCheckoutBody({ productType: 'subscription', locale: 'ht' });
      expect(r?.teacherSlug).toBeNull();
    });

    it('ignores an out-of-bounds or non-string teacherSlug, still accepts the subscription', () => {
      expect(parseCheckoutBody({ productType: 'subscription', teacherSlug: '', locale: 'ht' })?.teacherSlug).toBeNull();
      expect(parseCheckoutBody({ productType: 'subscription', teacherSlug: 'x'.repeat(101), locale: 'ht' })?.teacherSlug).toBeNull();
      expect(parseCheckoutBody({ productType: 'subscription', teacherSlug: 42, locale: 'ht' })?.teacherSlug).toBeNull();
    });

    it('a teacherSlug on a course request is ignored — course ownership resolves via the course itself', () => {
      expect(parseCheckoutBody({ productType: 'course', courseSlug: 'abc', teacherSlug: 'someone-else' }))
        .toEqual({ productType: 'course', courseSlug: 'abc', teacherSlug: null, locale: 'ht' });
    });
  });
});
