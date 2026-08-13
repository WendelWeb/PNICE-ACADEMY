/**
 * Stage 1 fix (marketplace-boundary finding) — a platform-created promo
 * used to apply `appliesTo: 'subscription' | 'all'` to ANY subscription
 * checkout, including a NAMED teacher's own plan, unilaterally cutting into
 * that teacher's earnings with no consent. These prove the fix: 'subscription'
 * and 'all' only ever match the platform's own Pass PNICE now; 'course'
 * requires an exact slug match, never a blanket "any course" fallback.
 */
import { describe, it, expect } from 'vitest';
import { promoScopeOk } from './promo-scope';

describe('promoScopeOk — the marketplace-boundary fix', () => {
  describe("appliesTo: 'subscription'", () => {
    it('matches the platform Pass PNICE', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'subscription', courseSlug: null },
          { productType: 'subscription', courseSlug: null, productKind: 'platform' },
        ),
      ).toBe(true);
    });

    it('does NOT match a named teacher\'s own subscription plan (the bug)', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'subscription', courseSlug: null },
          { productType: 'subscription', courseSlug: null, productKind: 'teacher' },
        ),
      ).toBe(false);
    });

    it('does not match a course purchase', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'subscription', courseSlug: null },
          { productType: 'course', courseSlug: 'kou-a', productKind: null },
        ),
      ).toBe(false);
    });
  });

  describe("appliesTo: 'all'", () => {
    it('matches the platform Pass PNICE', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'all', courseSlug: null },
          { productType: 'subscription', courseSlug: null, productKind: 'platform' },
        ),
      ).toBe(true);
    });

    it("does NOT match a named teacher's own subscription plan (restricted to the platform's own pass until real consent exists)", () => {
      expect(
        promoScopeOk(
          { appliesTo: 'all', courseSlug: null },
          { productType: 'subscription', courseSlug: null, productKind: 'teacher' },
        ),
      ).toBe(false);
    });

    it('does NOT match any course purchase (every course has its own teacher owner now)', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'all', courseSlug: null },
          { productType: 'course', courseSlug: 'kou-a', productKind: null },
        ),
      ).toBe(false);
    });
  });

  describe("appliesTo: 'course'", () => {
    it('matches the exact same course slug', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'course', courseSlug: 'kou-a' },
          { productType: 'course', courseSlug: 'kou-a', productKind: null },
        ),
      ).toBe(true);
    });

    it('does not match a different course slug', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'course', courseSlug: 'kou-a' },
          { productType: 'course', courseSlug: 'kou-b', productKind: null },
        ),
      ).toBe(false);
    });

    it('a null courseSlug on the promo no longer blanket-matches every course (closed hole)', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'course', courseSlug: null },
          { productType: 'course', courseSlug: 'kou-a', productKind: null },
        ),
      ).toBe(false);
    });

    it('does not match a subscription purchase', () => {
      expect(
        promoScopeOk(
          { appliesTo: 'course', courseSlug: 'kou-a' },
          { productType: 'subscription', courseSlug: null, productKind: 'platform' },
        ),
      ).toBe(false);
    });
  });
});
