/**
 * Promo → charge maths (Stage: checkout honesty). Pure and dependency-free:
 * `/api/checkout` re-validates the submitted code server-side (the SAME
 * `validatePromo` the checkout field's preview uses, lib/admin/data) against
 * the resolved product's real gross amount, then THIS module decides the
 * exact `unit_amount` the hand-built Stripe session is created with — the
 * fix for the old dishonesty where the field previewed a discount but the
 * session silently charged full price.
 *
 * NEVER trusts client-side numbers: the caller passes the server-resolved
 * gross (lib/payments/products.ts) and the server-side validation result;
 * the discount is re-derived from those two facts only.
 */
import type { PromoValidation } from '@/lib/admin/data';

/**
 * Stripe's minimum card charge in USD cents ($0.50). A code that drags the
 * total below this (e.g. 100%-off) cannot be charged as a card payment —
 * refused with a CLEAR error rather than silently charging full price or a
 * fabricated minimum.
 */
export const MIN_CHARGE_CENTS = 50;

export type PromoApplication =
  | { ok: true; amountCents: number; discountCents: number }
  /** `reason` feeds the same `checkout.promo.error.*` message bucket the
   *  preview field already uses ('not_found' | 'inactive' | 'expired' |
   *  'depleted' | 'scheduled' | 'wrong_product' | 'too_small'). */
  | { ok: false; reason: string };

/**
 * The one place a validated promo becomes a charge amount. Clamps defensively
 * (a discount can never exceed the gross, never be negative) so a malformed
 * validation result can only ever reduce the discount, never inflate it —
 * and a total below Stripe's minimum is refused, never mis-charged.
 */
export function applyPromo(grossCents: number, v: PromoValidation): PromoApplication {
  if (!v.valid) return { ok: false, reason: v.reason || 'not_found' };
  const discountCents = Math.min(Math.max(Math.round(v.discountCents ?? 0), 0), grossCents);
  const amountCents = grossCents - discountCents;
  if (amountCents < MIN_CHARGE_CENTS) return { ok: false, reason: 'too_small' };
  return { ok: true, amountCents, discountCents };
}
