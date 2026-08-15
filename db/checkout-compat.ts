/**
 * db/checkout-compat.ts — tolerates a live DB that still lags migration 0021
 * (`checkout_sessions.cart_id`) on the WRITE path of every checkout.
 *
 * Same reality as db/payments-compat.ts's `paymentsPre0019`, proven the same
 * way (`.toSQL()`): drizzle names EVERY schema column in every INSERT it
 * builds, supplying `default` for omitted keys — so the moment `cartId`
 * exists in db/schema.ts, EVERY insert into checkout_sessions (the Stripe
 * route's included, which never heard of carts) references `cart_id` and
 * fails 42703 on a pre-0021 DB. Omitting the column from the SQL requires a
 * table object that does not know it exists. This is that object.
 *
 * Consumers: the three checkout routes' insert fallbacks. A BASKET cannot
 * fall back (unlinked rows for one charged total would strand the buyer's
 * money) and refuses honestly instead; a SINGLE purchase retries through
 * this twin and keeps working exactly as it did before the column existed.
 */
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** `checkout_sessions` as an un-migrated (pre-0021) production DB knows it. */
export const checkoutSessionsPre0021 = pgTable('checkout_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  sessionId: text('session_id'),
  productType: text('product_type').$type<'course' | 'subscription'>().notNull(),
  courseSlug: text('course_slug'),
  amountCents: integer('amount_cents').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
});
