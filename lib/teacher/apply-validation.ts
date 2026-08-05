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

  const payoutError = validatePayoutSettings(input.payoutMethod, input.payoutDestination);
  if (payoutError) return payoutError;

  if (input.photoUrl?.trim()) {
    const photoUrl = input.photoUrl.trim();
    if (!isValidHttpUrl(photoUrl)) return 'photo_url_invalid';
  }

  if (!input.termsAccepted) return 'terms_required';
  return null;
}

/**
 * Payout method + destination validation, extracted out of
 * `validateApplyInput` (Task C3 fix) so `lib/teacher/studio-actions.ts`'s
 * `updateMyPayoutSettingsAction` — an ALREADY-APPROVED teacher changing how
 * they get paid, reached from the studio rather than the apply wizard — can
 * enforce the EXACT SAME rule instead of duplicating it: a payout value the
 * apply flow would reject must never be writable through the studio's
 * settings form either. Returns the first failing field's error code, or
 * `null` if acceptable (same contract as `validateApplyInput`).
 */
export function validatePayoutSettings(
  payoutMethod: PayoutMethod,
  payoutDestination: string,
): string | null {
  if (!PAYOUT_METHODS.includes(payoutMethod)) return 'payout_method_invalid';

  const payoutDest = payoutDestination?.trim() ?? '';
  if (!payoutDest) return 'payout_destination_required';
  if (payoutDest.length > PAYOUT_DESTINATION_MAX_LENGTH) return 'payout_destination_too_long';

  return null;
}

/**
 * Task: per-teacher plan pricing. Bounds are deliberately generous, sane
 * guardrails against fat-fingered input (a stray extra digit) rather than a
 * real business rule — $1.00 to $1,000.00 per month. Documented here because
 * both the studio's price form and `updateMyPlanAction`'s server-side
 * re-check (lib/teacher/studio-actions.ts) share this exact constant, so a
 * price the form would reject can never be written another way.
 */
export const PLAN_PRICE_MIN_CENTS = 100; // $1.00/mo
export const PLAN_PRICE_MAX_CENTS = 100_000; // $1,000.00/mo

/**
 * Validates a teacher's own monthly plan price (USD cents). Returns the
 * first failing field's error code, or `null` if acceptable — same contract
 * as `validatePayoutSettings`.
 */
export function validatePlanPrice(priceCentsMonthly: number): string | null {
  if (!Number.isInteger(priceCentsMonthly)) return 'invalid_price';
  if (priceCentsMonthly < PLAN_PRICE_MIN_CENTS || priceCentsMonthly > PLAN_PRICE_MAX_CENTS) return 'invalid_price';
  return null;
}

/**
 * Admin-notification idempotence (Stage 7 — the ONE decision that gates
 * `applyAsTeacherAction`'s `adminNotifications` insert): a genuinely NEW
 * submission needing review (no profile yet, or a rejected applicant
 * re-applying) raises a notification; a still-pending applicant merely
 * amending their answers does NOT — they're already sitting in the review
 * queue, so a second notification would just be noise for the same one
 * thing an admin still needs to act on. Kept here (not lib/teacher/
 * actions.ts) for the same 'use server' reason as every other pure helper in
 * this file — see the file header.
 */
export function isNewTeacherApplication(
  existingStatus: 'pending' | 'approved' | 'suspended' | 'rejected' | undefined,
): boolean {
  return !existingStatus || existingStatus === 'rejected';
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

/**
 * Forgiving URL entry, shared by client AND server (review fix): a teacher
 * pasting "monsite.com/foto.jpg" from memory shouldn't be told their link is
 * broken over a missing scheme — a value that looks like a bare domain
 * (letters/digits/dashes with at least one dot, optionally followed by a
 * path) gets 'https://' prepended. Anything already carrying a scheme, or
 * not domain-shaped at all, is returned untouched (trimmed) for
 * `isValidHttpUrl` above to judge. Used by `ResourcesEditor`'s blur
 * normalizer and by the image write actions (studio + admin CMS), which must
 * never store a URL `next/image` would throw on at render time.
 */
export function normalizeHttpUrlInput(value: string): string {
  const s = value.trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(s)) return `https://${s}`;
  return s;
}
