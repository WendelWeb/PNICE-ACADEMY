/**
 * Resolve what is being bought into a display name + amount in cents.
 * Single source of truth for checkout amounts: `lib/courses/source.ts`
 * (course price/title — DB-backed, gated, falls back to the static
 * `data/courses.ts` catalog, Task C2-T5) + `data/pricing.ts` (the flat
 * subscription price, unrelated to any course row).
 *
 * Async because the course lookup is now a DB read (`getCourseBySlug`) so
 * the price charged at checkout is always the owner's CURRENT price for that
 * course (CMS-editable since Task C2-T4), not a stale build-time constant —
 * identical to today's amount while the DB fallback is in effect (same
 * static numbers, same shape).
 */
import { getCourseBySlug } from '@/lib/courses/source';
import { SUBSCRIPTION_USD } from '@/data/pricing';

export type ResolvedProduct = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  nameFr: string;
  nameHt: string;
  amountCents: number;
};

export async function resolveProduct(input: {
  productType: 'course' | 'subscription';
  courseSlug?: string | null;
}): Promise<ResolvedProduct | null> {
  if (input.productType === 'subscription') {
    return {
      productType: 'subscription',
      courseSlug: null,
      nameFr: 'Abonnement mensuel PNICE Academy',
      nameHt: 'Abònman chak mwa PNICE Academy',
      amountCents: SUBSCRIPTION_USD * 100,
    };
  }
  if (!input.courseSlug) return null;
  const course = await getCourseBySlug(input.courseSlug);
  if (!course) return null;
  return {
    productType: 'course',
    courseSlug: course.slug,
    nameFr: course.title_fr,
    nameHt: course.title_ht,
    amountCents: Math.round(course.priceUsd * 100),
  };
}
