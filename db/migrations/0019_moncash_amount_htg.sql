-- Stage 2 (money-exactness pass): freeze the REAL gourdes MonCash charged, at
-- the moment of sale, instead of leaving every receipt to re-derive an HTG
-- figure from whatever FX rate happens to be live when it is rendered
-- (lib/payments/moncash-fulfill.ts's `fulfillMoncashOrder` already receives
-- this figure from MonCash's own RetrieveOrderPayment answer — it was just
-- never written anywhere). NULL for every Stripe row and for MonCash rows
-- recorded before this column existed; both fall back to a live-rate
-- ESTIMATE at render time, same as before this migration.
ALTER TABLE "payments" ADD COLUMN "amount_htg" integer;