import { describe, it, expect } from 'vitest';
import { resolveProduct } from '@/lib/payments/products';
import { courses } from '@/data/courses';
import { SUBSCRIPTION_USD } from '@/data/pricing';

// No DATABASE_URL in the test env ⇒ lib/courses/source.ts's getCourseBySlug
// falls back to the static `data/courses.ts` catalog (never throws) — so
// these assertions double as the "fallback == today's static data, byte
// for byte" guarantee the money path depends on (Task C2-T5).
describe('resolveProduct', () => {
  it('resolves the subscription at the canonical price', async () => {
    const p = await resolveProduct({ productType: 'subscription' });
    expect(p).not.toBeNull();
    expect(p!.amountCents).toBe(SUBSCRIPTION_USD * 100);
    expect(p!.courseSlug).toBeNull();
    expect(p!.productType).toBe('subscription');
  });

  it('resolves every catalog course with its own price in cents (via the DB source, fallback == static today)', async () => {
    for (const c of courses) {
      const p = await resolveProduct({ productType: 'course', courseSlug: c.slug });
      expect(p, c.slug).not.toBeNull();
      expect(p!.amountCents).toBe(Math.round(c.priceUsd * 100));
      expect(p!.nameFr).toBe(c.title_fr);
      expect(p!.nameHt).toBe(c.title_ht);
    }
  });

  it('returns null for an unknown slug and for course without slug', async () => {
    expect(await resolveProduct({ productType: 'course', courseSlug: 'nope' })).toBeNull();
    expect(await resolveProduct({ productType: 'course' })).toBeNull();
  });
});
