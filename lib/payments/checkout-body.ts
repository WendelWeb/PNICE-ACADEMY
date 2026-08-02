export type CheckoutBody = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  /** `/prof/[slug]`'s own slug (Task: per-teacher subscription checkout) —
   *  set only for a subscription purchase; ignored for a course purchase
   *  (the course's owner is resolved from `courses.owner_user_id` instead,
   *  see lib/teacher/earnings.ts). `null` selects the platform-default plan,
   *  same as today. */
  teacherSlug: string | null;
  locale: 'fr' | 'ht';
};

function readTeacherSlug(b: Record<string, unknown>): string | null {
  return typeof b.teacherSlug === 'string' && b.teacherSlug.length > 0 && b.teacherSlug.length <= 100
    ? b.teacherSlug
    : null;
}

export function parseCheckoutBody(raw: unknown): CheckoutBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const locale: 'fr' | 'ht' = b.locale === 'fr' ? 'fr' : 'ht';
  if (b.productType === 'subscription')
    return { productType: 'subscription', courseSlug: null, teacherSlug: readTeacherSlug(b), locale };
  if (
    b.productType === 'course' &&
    typeof b.courseSlug === 'string' &&
    b.courseSlug.length > 0 &&
    b.courseSlug.length <= 100
  )
    return { productType: 'course', courseSlug: b.courseSlug, teacherSlug: null, locale };
  return null;
}
