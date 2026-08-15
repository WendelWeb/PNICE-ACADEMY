-- « Panye » — buy several courses in ONE wallet payment (owner request,
-- août 2026: "aucune option ajouter au panier, c'est plutôt con non").
--
-- MonCash and NatCash take a single payment for a single amount, so a basket
-- of N courses becomes N checkout_sessions rows sharing one cart_id — and it
-- is the CART id, not any row's own, that goes to the gateway as orderId.
-- Settlement resolves cart_id → all rows and fulfils each through the same
-- idempotent single-course path (per-row payments/enrollment/teacher share),
-- so the 70/30 split credits EACH course's own teacher, never a lump.
--
-- Additive and nullable: every existing row (and every ordinary single-item
-- checkout after this) simply has NULL. The index serves settlement's
-- "give me every row of this cart" read and the reconcile cron.
ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "cart_id" uuid;
CREATE INDEX IF NOT EXISTS "checkout_sessions_cart_id_idx" ON "checkout_sessions" ("cart_id") WHERE "cart_id" IS NOT NULL;
