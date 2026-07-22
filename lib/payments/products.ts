/**
 * Resolve what is being bought into a display name + amount in cents.
 * Single source of truth for checkout amounts: data/courses.ts + data/pricing.ts.
 */
import { courses } from '@/data/courses';
import { SUBSCRIPTION_USD } from '@/data/pricing';

export type ResolvedProduct = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  nameFr: string;
  nameHt: string;
  amountCents: number;
};

export function resolveProduct(input: {
  productType: 'course' | 'subscription';
  courseSlug?: string | null;
}): ResolvedProduct | null {
  if (input.productType === 'subscription') {
    return {
      productType: 'subscription',
      courseSlug: null,
      nameFr: 'Abonnement mensuel PNICE Academy',
      nameHt: 'Abònman chak mwa PNICE Academy',
      amountCents: SUBSCRIPTION_USD * 100,
    };
  }
  const course = courses.find((c) => c.slug === input.courseSlug);
  if (!course) return null;
  return {
    productType: 'course',
    courseSlug: course.slug,
    nameFr: course.title_fr,
    nameHt: course.title_ht,
    amountCents: Math.round(course.priceUsd * 100),
  };
}
