import { describe, it, expect } from 'vitest';
import {
  validateCoursePriceCents,
  isFreeCourse,
  MIN_COURSE_PRICE_CENTS,
  MAX_COURSE_PRICE_CENTS,
} from './pricing-rules';

describe('validateCoursePriceCents — « 0 $ impossible, Gratis est un choix »', () => {
  it('0 is legal and means FREE (the explicit studio toggle)', () => {
    expect(validateCoursePriceCents(0)).toEqual({ ok: true, free: true });
  });

  it('1-99 cents is the accident the rule exists to kill', () => {
    expect(validateCoursePriceCents(1)).toEqual({ ok: false, message: 'price_too_low' });
    expect(validateCoursePriceCents(99)).toEqual({ ok: false, message: 'price_too_low' });
  });

  it('$1 up to the cap is a normal paid price', () => {
    expect(validateCoursePriceCents(MIN_COURSE_PRICE_CENTS)).toEqual({ ok: true, free: false });
    expect(validateCoursePriceCents(200)).toEqual({ ok: true, free: false });
    expect(validateCoursePriceCents(MAX_COURSE_PRICE_CENTS)).toEqual({ ok: true, free: false });
  });

  it('negatives, floats, junk and absurd amounts are refused outright', () => {
    expect(validateCoursePriceCents(-100)).toEqual({ ok: false, message: 'invalid_price' });
    expect(validateCoursePriceCents(150.5)).toEqual({ ok: false, message: 'invalid_price' });
    expect(validateCoursePriceCents(MAX_COURSE_PRICE_CENTS + 1)).toEqual({ ok: false, message: 'invalid_price' });
    expect(validateCoursePriceCents(NaN)).toEqual({ ok: false, message: 'invalid_price' });
    expect(validateCoursePriceCents(Infinity)).toEqual({ ok: false, message: 'invalid_price' });
    expect(validateCoursePriceCents('200' as unknown)).toEqual({ ok: false, message: 'invalid_price' });
    expect(validateCoursePriceCents(undefined)).toEqual({ ok: false, message: 'invalid_price' });
  });
});

describe('isFreeCourse', () => {
  it('exactly 0 USD is free; anything else is not', () => {
    expect(isFreeCourse(0)).toBe(true);
    expect(isFreeCourse(0.5)).toBe(false);
    expect(isFreeCourse(2)).toBe(false);
  });
});
