/**
 * What is `/checkout` actually selling? (Stage: checkout honesty.)
 *
 * The old page derived `isSub = !course`, so an unknown or unpublished
 * `?course=` slug SILENTLY morphed a course purchase into a platform-pass
 * subscription checkout — a visitor following a stale link could subscribe
 * to something they never asked for. The rule is now explicit and pure:
 * a REQUESTED course that doesn't resolve is a 404, never a subscription.
 * (Mirrors the existing teacher-slug branch: an unresolvable NAMED teacher
 * 404s rather than silently charging the platform default.)
 */
export type CheckoutMode = 'course' | 'subscription' | 'not_found';

export function checkoutMode(input: {
  /** Was a `?course=` slug present on the URL at all? */
  courseRequested: boolean;
  /** Did that slug resolve to a published course? */
  courseResolved: boolean;
}): CheckoutMode {
  if (input.courseRequested) return input.courseResolved ? 'course' : 'not_found';
  return 'subscription';
}
