export type CheckoutBody = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  /** `/prof/[slug]`'s own slug (Task: per-teacher subscription checkout) —
   *  set only for a subscription purchase; ignored for a course purchase
   *  (the course's owner is resolved from `courses.owner_user_id` instead,
   *  see lib/teacher/earnings.ts). `null` selects the platform-default plan,
   *  same as today. */
  teacherSlug: string | null;
  /** The promo code the buyer applied on the checkout page (Stage: checkout
   *  honesty) — carried OPAQUE here; `/api/checkout` re-validates it
   *  server-side against the resolved product's real price and refuses with
   *  a clear error if it no longer applies. The client never sends amounts,
   *  only the code. `null` = no code applied. */
  promoCode: string | null;
  locale: 'fr' | 'ht';
};

function readTeacherSlug(b: Record<string, unknown>): string | null {
  return typeof b.teacherSlug === 'string' && b.teacherSlug.length > 0 && b.teacherSlug.length <= 100
    ? b.teacherSlug
    : null;
}

function readPromoCode(b: Record<string, unknown>): string | null {
  if (typeof b.promoCode !== 'string') return null;
  const code = b.promoCode.trim();
  return code.length > 0 && code.length <= 64 ? code : null;
}

export function parseCheckoutBody(raw: unknown): CheckoutBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const locale: 'fr' | 'ht' = b.locale === 'fr' ? 'fr' : 'ht';
  if (b.productType === 'subscription')
    return {
      productType: 'subscription',
      courseSlug: null,
      teacherSlug: readTeacherSlug(b),
      promoCode: readPromoCode(b),
      locale,
    };
  if (
    b.productType === 'course' &&
    typeof b.courseSlug === 'string' &&
    b.courseSlug.length > 0 &&
    b.courseSlug.length <= 100
  )
    return {
      productType: 'course',
      courseSlug: b.courseSlug,
      teacherSlug: null,
      promoCode: readPromoCode(b),
      locale,
    };
  return null;
}
