import { describe, it, expect } from 'vitest';
import { resolveProduct } from '@/lib/payments/products';
import { courses } from '@/data/courses';
import { teachers } from '@/data/teachers';
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

  // Task: per-teacher subscription checkout — no DATABASE_URL in this test
  // env, so every teacher-specific resolution runs its own no-DB fallback
  // branch (lib/payments/products.ts's `resolveNamedTeacherSubscription`).
  describe('teacherSlug (per-teacher subscription checkout)', () => {
    it('a course purchase never carries a teacherPlanId/teacherUserId', async () => {
      const p = await resolveProduct({ productType: 'course', courseSlug: courses[0]!.slug });
      expect(p!.teacherPlanId).toBeNull();
      expect(p!.teacherUserId).toBeNull();
    });

    it('the platform-default subscription (no teacherSlug) carries no teacherPlanId with no DB', async () => {
      const p = await resolveProduct({ productType: 'subscription', teacherSlug: null });
      expect(p!.teacherPlanId).toBeNull();
      expect(p!.teacherUserId).toBeNull();
      expect(p!.amountCents).toBe(SUBSCRIPTION_USD * 100);
    });

    it("teacher #1's OWN slug still resolves to the platform default with no DB (never a 404)", async () => {
      const teacherOne = teachers[0]!;
      const p = await resolveProduct({ productType: 'subscription', teacherSlug: teacherOne.slug });
      expect(p).not.toBeNull();
      expect(p!.amountCents).toBe(SUBSCRIPTION_USD * 100);
      expect(p!.teacherPlanId).toBeNull();
    });

    it('an unknown/unresolvable teacher slug returns null (checkout 400s, same as an unknown course)', async () => {
      expect(await resolveProduct({ productType: 'subscription', teacherSlug: 'no-such-teacher' })).toBeNull();
    });
  });
});
