/**
 * Unit tests for lib/platformPrice.ts (Task: two subscription products). No
 * DATABASE_URL in the test env (see lib/payments/products.test.ts's own
 * comment) ⇒ every gated read/write below exercises its no-DB fallback path —
 * mirrors lib/teacher/profile.test.ts's `getCommissionPct` coverage.
 */
import { describe, it, expect } from 'vitest';
import {
  getPlatformPassPriceCents,
  setPlatformPassPriceCents,
  normalizePlatformPassCents,
} from './platformPrice';
import { SUBSCRIPTION_USD } from '@/data/pricing';

describe('normalizePlatformPassCents — the ONE place this guard lives', () => {
  it('rounds a fractional cents value', () => {
    expect(normalizePlatformPassCents(7900.4)).toBe(7900);
    expect(normalizePlatformPassCents(7900.5)).toBe(7901);
  });

  it('rejects zero, negative, and non-finite values', () => {
    expect(() => normalizePlatformPassCents(0)).toThrow('invalid_price');
    expect(() => normalizePlatformPassCents(-500)).toThrow('invalid_price');
    expect(() => normalizePlatformPassCents(NaN)).toThrow('invalid_price');
    expect(() => normalizePlatformPassCents(Infinity)).toThrow('invalid_price');
  });
});

describe('getPlatformPassPriceCents', () => {
  it('falls back to the SUBSCRIPTION_USD default with no DB configured', async () => {
    expect(await getPlatformPassPriceCents()).toBe(SUBSCRIPTION_USD * 100);
  });
});

describe('setPlatformPassPriceCents', () => {
  it('rejects an invalid value before ever touching the DB', async () => {
    await expect(setPlatformPassPriceCents(0)).rejects.toThrow('invalid_price');
    await expect(setPlatformPassPriceCents(-100)).rejects.toThrow('invalid_price');
  });

  it('throws db_required for a valid value with no DB configured', async () => {
    await expect(setPlatformPassPriceCents(9900)).rejects.toThrow('db_required');
  });
});
