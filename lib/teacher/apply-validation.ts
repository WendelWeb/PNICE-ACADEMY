/**
 * lib/teacher/apply-validation.ts — pure, client-safe validation for the
 * teacher application form (Task C3-T2).
 *
 * Deliberately kept OUT of lib/teacher/actions.ts: that file carries the
 * 'use server' directive, and Next.js requires every top-level export of a
 * 'use server' module to be an async function — a plain sync function
 * (`validateApplyInput`) or a const (`BIO_MIN_LENGTH`) exported from there
 * would fail the build. Splitting the pure rules out here also lets the
 * client wizard (components/teacher/ApplyWizard.tsx) import the SAME
 * constants/validator the server re-checks on submit, so client-side and
 * server-side validation can never drift apart.
 */

export type PayoutMethod = 'moncash' | 'natcash' | 'paypal' | 'bank';

export const PAYOUT_METHODS: PayoutMethod[] = ['moncash', 'natcash', 'paypal', 'bank'];

export type ApplyAsTeacherInput = {
  displayName: string;
  bioHt: string;
  bioFr: string;
  photoUrl?: string | null;
  payoutMethod: PayoutMethod;
  payoutDestination: string;
  termsAccepted: boolean;
};

/** Minimum bio length (per language) — enough to be an actual introduction,
 *  not a one-word placeholder. */
export const BIO_MIN_LENGTH = 40;
export const BIO_MAX_LENGTH = 2000;
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const PAYOUT_DESTINATION_MAX_LENGTH = 200;

/**
 * Returns the first failing field's error code, or `null` if the input is
 * acceptable. Called by the client wizard per-step (immediate feedback) AND
 * by `applyAsTeacherAction` right before writing (defense in depth — a user
 * who somehow bypasses the client checks still can't write a malformed row).
 */
export function validateApplyInput(input: ApplyAsTeacherInput): string | null {
  const displayName = input.displayName?.trim() ?? '';
  if (!displayName) return 'display_name_required';
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) return 'display_name_too_long';

  const bioHtTrimmed = input.bioHt?.trim() ?? '';
  if (bioHtTrimmed.length < BIO_MIN_LENGTH) return 'bio_ht_too_short';
  if (bioHtTrimmed.length > BIO_MAX_LENGTH) return 'bio_ht_too_long';

  const bioFrTrimmed = input.bioFr?.trim() ?? '';
  if (bioFrTrimmed.length < BIO_MIN_LENGTH) return 'bio_fr_too_short';
  if (bioFrTrimmed.length > BIO_MAX_LENGTH) return 'bio_fr_too_long';

  if (!PAYOUT_METHODS.includes(input.payoutMethod)) return 'payout_method_invalid';

  const payoutDest = input.payoutDestination?.trim() ?? '';
  if (!payoutDest) return 'payout_destination_required';
  if (payoutDest.length > PAYOUT_DESTINATION_MAX_LENGTH) return 'payout_destination_too_long';

  if (input.photoUrl?.trim()) {
    const photoUrl = input.photoUrl.trim();
    if (!isValidHttpUrl(photoUrl)) return 'photo_url_invalid';
  }

  if (!input.termsAccepted) return 'terms_required';
  return null;
}

/**
 * Validate that a URL is http(s) and well-formed. Exported: also reused as
 * the RENDER-time protocol allowlist for a teacher's public `photo_url`
 * (`lib/teacher/public.ts`'s `isSafePhotoUrl`) — the same rule enforced here
 * at write time, applied again in defense-in-depth before any public render.
 */
export function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}
