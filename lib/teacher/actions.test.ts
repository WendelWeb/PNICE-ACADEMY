/**
 * Unit tests for lib/teacher/actions.ts + apply-validation.ts (Task C3-T2) —
 * the pure validation logic and the env gate. No live DB/Clerk is touched:
 * `validateApplyInput` is a pure function, and `applyAsTeacherAction` checks
 * `dbConfigured()` BEFORE calling `auth()` or touching `db` (mirrors
 * lib/site-actions-public.ts's `captureUtmAction` — see that test for the
 * same reasoning), so with no DATABASE_URL set (the default in this test
 * environment — vitest.config.ts doesn't load .env.local) the action
 * resolves its db_required fallback without ever reaching Clerk.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  validateApplyInput,
  validatePayoutSettings,
  validatePlanPrice,
  BIO_MIN_LENGTH,
  PAYOUT_DESTINATION_MAX_LENGTH,
  PLAN_PRICE_MIN_CENTS,
  PLAN_PRICE_MAX_CENTS,
  type ApplyAsTeacherInput,
  type PayoutMethod,
} from './apply-validation';
import { applyAsTeacherAction } from './actions';

const validInput: ApplyAsTeacherInput = {
  displayName: 'Pwofesè Jan',
  bioHt: 'M ap anseye kouti depi 10 ane, mwen fè anpil rad pou kliyan Ayiti ak dyaspora a.',
  bioFr: "J'enseigne la couture depuis 10 ans, j'ai confectionné des vêtements pour des clients en Haïti et dans la diaspora.",
  photoUrl: 'https://example.com/photo.jpg',
  payoutMethod: 'moncash',
  payoutDestination: '+509 3712 3456',
  termsAccepted: true,
};

describe('validateApplyInput — pure field validation', () => {
  it('accepts a fully valid input', () => {
    expect(validateApplyInput(validInput)).toBeNull();
  });

  it('rejects an empty display name', () => {
    expect(validateApplyInput({ ...validInput, displayName: '   ' })).toBe(
      'display_name_required',
    );
  });

  it('rejects a display name over 80 characters', () => {
    expect(
      validateApplyInput({ ...validInput, displayName: 'x'.repeat(81) }),
    ).toBe('display_name_too_long');
  });

  it('rejects a bio_ht shorter than the minimum', () => {
    expect(validateApplyInput({ ...validInput, bioHt: 'twò kout' })).toBe(
      'bio_ht_too_short',
    );
  });

  it('accepts a bio_ht exactly at the minimum length', () => {
    expect(
      validateApplyInput({ ...validInput, bioHt: 'x'.repeat(BIO_MIN_LENGTH) }),
    ).toBeNull();
  });

  it('rejects a bio_fr shorter than the minimum', () => {
    expect(validateApplyInput({ ...validInput, bioFr: 'trop court' })).toBe(
      'bio_fr_too_short',
    );
  });

  it('rejects an invalid payout method', () => {
    expect(
      validateApplyInput({
        ...validInput,
        payoutMethod: 'bitcoin' as ApplyAsTeacherInput['payoutMethod'],
      }),
    ).toBe('payout_method_invalid');
  });

  it('rejects an empty payout destination', () => {
    expect(validateApplyInput({ ...validInput, payoutDestination: '' })).toBe(
      'payout_destination_required',
    );
  });

  it('rejects when terms are not accepted', () => {
    expect(validateApplyInput({ ...validInput, termsAccepted: false })).toBe(
      'terms_required',
    );
  });

  it('validates every payout method as acceptable on its own', () => {
    for (const payoutMethod of ['moncash', 'natcash', 'paypal', 'bank'] as const) {
      expect(validateApplyInput({ ...validInput, payoutMethod })).toBeNull();
    }
  });
});

describe('validatePayoutSettings — pure field validation (Task C3 fix, shared with updateMyPayoutSettingsAction)', () => {
  it('accepts a valid method + destination', () => {
    expect(validatePayoutSettings('moncash', '+509 3712 3456')).toBeNull();
  });

  it('validates every payout method as acceptable on its own', () => {
    for (const payoutMethod of ['moncash', 'natcash', 'paypal', 'bank'] as const) {
      expect(validatePayoutSettings(payoutMethod, 'some-destination')).toBeNull();
    }
  });

  it('rejects an invalid payout method', () => {
    expect(validatePayoutSettings('bitcoin' as PayoutMethod, 'x')).toBe('payout_method_invalid');
  });

  it('rejects an empty destination', () => {
    expect(validatePayoutSettings('moncash', '')).toBe('payout_destination_required');
  });

  it('rejects a whitespace-only destination', () => {
    expect(validatePayoutSettings('moncash', '   ')).toBe('payout_destination_required');
  });

  it('rejects a destination over the max length', () => {
    expect(validatePayoutSettings('moncash', 'x'.repeat(PAYOUT_DESTINATION_MAX_LENGTH + 1))).toBe(
      'payout_destination_too_long',
    );
  });

  it('accepts a destination exactly at the max length', () => {
    expect(validatePayoutSettings('moncash', 'x'.repeat(PAYOUT_DESTINATION_MAX_LENGTH))).toBeNull();
  });

  it('agrees with validateApplyInput on the same payout inputs (no drift after extraction)', () => {
    const bad: ApplyAsTeacherInput = { ...validInput, payoutMethod: 'bitcoin' as PayoutMethod };
    expect(validateApplyInput(bad)).toBe(validatePayoutSettings(bad.payoutMethod, bad.payoutDestination));
  });
});

describe('validatePlanPrice — pure field validation (Task: per-teacher plan pricing)', () => {
  it('accepts a price within bounds', () => {
    expect(validatePlanPrice(7900)).toBeNull();
  });

  it('accepts the min and max bounds exactly', () => {
    expect(validatePlanPrice(PLAN_PRICE_MIN_CENTS)).toBeNull();
    expect(validatePlanPrice(PLAN_PRICE_MAX_CENTS)).toBeNull();
  });

  it('rejects a price below the minimum', () => {
    expect(validatePlanPrice(PLAN_PRICE_MIN_CENTS - 1)).toBe('invalid_price');
  });

  it('rejects a price above the maximum', () => {
    expect(validatePlanPrice(PLAN_PRICE_MAX_CENTS + 1)).toBe('invalid_price');
  });

  it('rejects zero and negative amounts', () => {
    expect(validatePlanPrice(0)).toBe('invalid_price');
    expect(validatePlanPrice(-100)).toBe('invalid_price');
  });

  it('rejects a non-integer amount', () => {
    expect(validatePlanPrice(79.5)).toBe('invalid_price');
  });
});

describe('applyAsTeacherAction — env gate (no DATABASE_URL, never reaches Clerk)', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('returns db_required with no DATABASE_URL, before touching auth()/db', async () => {
    delete process.env.DATABASE_URL;
    const result = await applyAsTeacherAction(validInput);
    expect(result).toEqual({ ok: false, message: 'db_required' });
  });
});
