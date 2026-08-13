/**
 * Shared, pure promo-scope rule (Stage 1 — admin/studio boundary). Used by
 * BOTH `lib/admin/data/real/marketing.ts` and `lib/admin/data/mock/index.ts`'s
 * `validatePromo` so the two never drift.
 *
 * THE MARKETPLACE-BOUNDARY FIX THIS CARRIES: a platform-created promo used
 * to have no idea whether it was about to discount the platform's OWN "Pass
 * PNICE" or a NAMED teacher's own subscription plan — `appliesTo:
 * 'subscription' | 'all'` matched EITHER, unilaterally cutting into a
 * third-party teacher's earnings with no consent (the discount is
 * subtracted from the charge BEFORE the 70/30 split, so the teacher's net
 * shrinks, not the platform's cut). `'subscription'`/`'all'` now only ever
 * match the platform's own pass (`productKind === 'platform'`) — never a
 * teacher's own plan (`'teacher'`), even though both are `productType:
 * 'subscription'`.
 *
 * `'course'` requires an EXACT slug match — the old `!promo.courseSlug`
 * "any course" fallback is gone. Every course belongs to exactly one
 * teacher now (no platform-owned course exists post-marketplace-pivot), so
 * a blanket course-wide promo would have the identical problem; the create
 * form has never actually produced a null `courseSlug` for a `'course'`
 * promo, this closes the same hole for a hand-crafted row.
 *
 * NOT YET SOLVED (tracked separately, needs a schema change): an admin can
 * still create a `'course'`-scoped promo for one specific, named teacher's
 * course without their consent — see `validatePromo`'s doc comment and the
 * create-promo form's owner-labelled picker, which at least makes the
 * admin SEE whose course they're about to discount.
 */
export type PromoScopeAppliesTo = 'subscription' | 'course' | 'all';
export type PromoScopeProductType = 'course' | 'subscription';
export type PromoScopeProductKind = 'teacher' | 'platform' | null;

export function promoScopeOk(
  promo: { appliesTo: PromoScopeAppliesTo; courseSlug: string | null },
  product: { productType: PromoScopeProductType; courseSlug: string | null; productKind: PromoScopeProductKind },
): boolean {
  return (
    (promo.appliesTo === 'all' && product.productType === 'subscription' && product.productKind === 'platform') ||
    (promo.appliesTo === 'subscription' && product.productType === 'subscription' && product.productKind === 'platform') ||
    (promo.appliesTo === 'course' && product.productType === 'course' && promo.courseSlug === product.courseSlug)
  );
}
