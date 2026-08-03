/**
 * Mark a promo redemption against a REAL payment (Stage: checkout honesty).
 *
 * Called from lib/payments/fulfill.ts (the ONLY place webhook events touch
 * the DB) whenever a completed checkout session carries `metadata[promoCode]`
 * — which /api/checkout only writes after validating the code server-side
 * and actually discounting the Stripe amount. This closes the redemption
 * loop the admin promo model already has: a `promo_redemptions` row linked
 * to the payment + a `promo_codes.used_count` bump (the same two writes
 * lib/admin/data/real/marketing.ts's `redeemPromo` does, minus the admin
 * actor — this is checkout completion, not an admin action).
 *
 * NEVER THROWS and idempotent, mirroring lib/teacher/earnings.ts's
 * `recordSaleEarning` exactly: fulfillment is already durably recorded when
 * this runs, so a failure here must never fail the webhook — and Stripe
 * redelivers events, so every path re-checks before writing:
 *   1. app-layer pre-check: an existing redemption for this payment ⇒ no-op;
 *   2. DB backstop: partial unique index `promo_redemptions_payment_uniq`
 *      (db/migrations/0018) + `onConflictDoNothing()` make the insert safe
 *      under concurrent deliveries; `used_count` bumps ONLY when the insert
 *      actually landed a row.
 */
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';

const T = schema;

export async function recordPromoRedemption(p: {
  paymentId: string;
  userDbId: string;
  promoCode: string;
}): Promise<void> {
  try {
    const [already] = await db
      .select({ id: T.promoRedemptions.id })
      .from(T.promoRedemptions)
      .where(eq(T.promoRedemptions.relatedPaymentId, p.paymentId))
      .limit(1);
    if (already) return;

    const [promo] = await db
      .select({ id: T.promoCodes.id })
      .from(T.promoCodes)
      .where(sql`lower(${T.promoCodes.code}) = ${p.promoCode.trim().toLowerCase()}`)
      .limit(1);
    // Code deleted between checkout and webhook — the discount was already
    // honestly applied to the charge; there is simply nothing left to mark.
    if (!promo) return;

    const inserted = await db
      .insert(T.promoRedemptions)
      .values({ userId: p.userDbId, promoCodeId: promo.id, relatedPaymentId: p.paymentId })
      .onConflictDoNothing()
      .returning({ id: T.promoRedemptions.id });
    if (inserted.length === 0) return; // concurrent delivery won the race

    await db
      .update(T.promoCodes)
      .set({ usedCount: sql`${T.promoCodes.usedCount} + 1` })
      .where(eq(T.promoCodes.id, promo.id));
  } catch (err) {
    console.error('[promo-redemption] recordPromoRedemption failed (payment already recorded):', err);
  }
}
