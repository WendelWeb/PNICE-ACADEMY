import { parseCartSlugs } from './cart';

export type CheckoutBody = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  /**
   * The « panye » (multi-course wallet purchase): every distinct course in
   * the basket, in the order the client sent them. For the ordinary
   * single-course checkout this is simply `[courseSlug]`, so consumers can
   * treat EVERY course purchase as a basket of ≥1 and never fork on shape.
   * Always `[]` for a subscription.
   */
  courseSlugs: string[];
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
  /**
   * The TOTAL (in cents) the client DISPLAYED when the buyer tapped pay —
   * never used to price anything (the server always re-resolves), only to
   * REFUSE when the display was stale: a wallet debits right after the
   * redirect, so a buyer must never authorise one figure and be charged
   * another. `null` = legacy caller, guard skipped.
   */
  expectedTotalCents: number | null;
  locale: 'fr' | 'ht';
};

function readTeacherSlug(b: Record<string, unknown>): string | null {
  return typeof b.teacherSlug === 'string' && b.teacherSlug.length > 0 && b.teacherSlug.length <= 100
    ? b.teacherSlug
    : null;
}

function readExpectedTotal(b: Record<string, unknown>): number | null {
  return typeof b.expectedTotalCents === 'number' && Number.isInteger(b.expectedTotalCents) && b.expectedTotalCents > 0 && b.expectedTotalCents <= 100_000_000
    ? b.expectedTotalCents
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
      courseSlugs: [],
      teacherSlug: readTeacherSlug(b),
      promoCode: readPromoCode(b),
      expectedTotalCents: readExpectedTotal(b),
      locale,
    };
  if (b.productType !== 'course') return null;

  // The « panye » shape: an explicit list of slugs. Wins over `courseSlug`
  // when both are present — a client that sends a basket means the basket.
  if (b.courseSlugs !== undefined) {
    const slugs = parseCartSlugs(b.courseSlugs);
    if (!slugs) return null;
    return {
      productType: 'course',
      courseSlug: slugs[0],
      courseSlugs: slugs,
      teacherSlug: null,
      promoCode: readPromoCode(b),
      expectedTotalCents: readExpectedTotal(b),
      locale,
    };
  }

  if (typeof b.courseSlug === 'string' && b.courseSlug.length > 0 && b.courseSlug.length <= 100)
    return {
      productType: 'course',
      courseSlug: b.courseSlug,
      courseSlugs: [b.courseSlug],
      teacherSlug: null,
      promoCode: readPromoCode(b),
      expectedTotalCents: readExpectedTotal(b),
      locale,
    };
  return null;
}
