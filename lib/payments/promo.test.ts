/**
 * Tests for lib/payments/promo.ts (Stage: checkout honesty) — the ONE place
 * a server-validated promo becomes the Stripe session's actual unit_amount.
 * The old bug: the field previewed a discount, the session charged FULL
 * price. These pin the fix: valid ⇒ exactly the discounted amount; invalid
 * or un-chargeable ⇒ a refusal with a reason, NEVER a silent full charge.
 */
import { describe, it, expect } from 'vitest';
import { applyPromo, MIN_CHARGE_CENTS } from './promo';
import type { PromoValidation } from '@/lib/admin/data';

const valid = (over: Partial<PromoValidation> = {}): PromoValidation => ({
  valid: true,
  reason: 'ok',
  code: 'LANSMAN20',
  discountType: 'percent',
  discountValue: 20,
  grossCents: 4900,
  discountCents: 980,
  netCents: 3920,
  ...over,
});

describe('applyPromo — discounted unit_amount maths', () => {
  it('a valid percent code charges exactly gross − discount', () => {
    const r = applyPromo(4900, valid());
    expect(r).toEqual({ ok: true, amountCents: 3920, discountCents: 980 });
  });

  it('a valid fixed code charges exactly gross − discount', () => {
    const r = applyPromo(4900, valid({ discountType: 'fixed', discountValue: 500, discountCents: 500, netCents: 4400 }));
    expect(r).toEqual({ ok: true, amountCents: 4400, discountCents: 500 });
  });

  it('an INVALID validation refuses with its reason — never a silent full charge', () => {
    const r = applyPromo(4900, { valid: false, reason: 'expired', code: 'OLD' });
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('an invalid validation with no reason still refuses (not_found)', () => {
    const r = applyPromo(4900, { valid: false, reason: '', code: 'X' });
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('clamps a discount larger than the gross — the charge can never go negative', () => {
    const r = applyPromo(4900, valid({ discountCents: 999999 }));
    // Fully clamped to gross ⇒ $0 ⇒ below Stripe's card minimum ⇒ refused.
    expect(r).toEqual({ ok: false, reason: 'too_small' });
  });

  it('clamps a negative/absent discount to zero — a malformed result can never INCREASE the charge', () => {
    expect(applyPromo(4900, valid({ discountCents: -500 }))).toEqual({ ok: true, amountCents: 4900, discountCents: 0 });
    expect(applyPromo(4900, valid({ discountCents: undefined }))).toEqual({ ok: true, amountCents: 4900, discountCents: 0 });
  });

  it('refuses a total below Stripe\'s card minimum instead of mis-charging', () => {
    // 100%-off on a $9 course ⇒ $0 — Stripe cannot charge it; clear refusal.
    expect(applyPromo(900, valid({ discountValue: 100, discountCents: 900, netCents: 0 })))
      .toEqual({ ok: false, reason: 'too_small' });
    // One cent above the line is fine…
    expect(applyPromo(900, valid({ discountCents: 900 - MIN_CHARGE_CENTS })))
      .toEqual({ ok: true, amountCents: MIN_CHARGE_CENTS, discountCents: 900 - MIN_CHARGE_CENTS });
    // …one below is refused.
    expect(applyPromo(900, valid({ discountCents: 900 - MIN_CHARGE_CENTS + 1 })))
      .toEqual({ ok: false, reason: 'too_small' });
  });

  it('rounds a fractional discountCents defensively', () => {
    const r = applyPromo(1000, valid({ discountCents: 333.4 }));
    expect(r).toEqual({ ok: true, amountCents: 667, discountCents: 333 });
  });
});
