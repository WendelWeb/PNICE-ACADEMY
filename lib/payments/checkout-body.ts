export type CheckoutBody = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  locale: 'fr' | 'ht';
};

export function parseCheckoutBody(raw: unknown): CheckoutBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const locale: 'fr' | 'ht' = b.locale === 'fr' ? 'fr' : 'ht';
  if (b.productType === 'subscription')
    return { productType: 'subscription', courseSlug: null, locale };
  if (
    b.productType === 'course' &&
    typeof b.courseSlug === 'string' &&
    b.courseSlug.length > 0 &&
    b.courseSlug.length <= 100
  )
    return { productType: 'course', courseSlug: b.courseSlug, locale };
  return null;
}
