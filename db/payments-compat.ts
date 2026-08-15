/**
 * db/payments-compat.ts — tolerates a live DB that still lags migration 0019
 * (`payments.amount_htg` — see db/migrations/0019_moncash_amount_htg.sql's
 * own header for why the column exists) on every READ of the `payments`
 * table across the app, not just the MonCash feature that added the column.
 *
 * A bare `db.select()` names EVERY schema column (db/index.ts's own
 * `isMissingColumnError` comment), so this ONE new nullable column fails the
 * WHOLE read on a DB the owner hasn't `db:push`-ed yet: the learner's own
 * receipt download (app/api/receipt/[paymentId]/route.ts), /kont's purchase
 * history (lib/learner/account.ts), the Stripe refund webhook
 * (lib/payments/fulfill.ts's fulfillChargeRefunded), and most of /admin
 * (lib/admin/data/real/*.ts) all read this table with a bare select. Same
 * idiom as lib/payments/fulfill.ts's `insertSubscriptionRow`/
 * `selectSubscriptionByProviderRef` and lib/learner/account.ts's
 * `selectMySubscriptionRows` (all protecting db/migrations/0015's
 * `subscriptions.kind` the same way) — this is that pattern's payments-table
 * twin, shared so every call site doesn't reinvent its own column list.
 */
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { payments } from './schema';
import { isMissingColumnError } from './index';

/**
 * WRITE-side twin of the compat idiom: the `payments` table AS THE LIVE DB
 * KNOWS IT before migration 0019 — i.e. WITHOUT `amount_htg`.
 *
 * WHY A WHOLE SECOND TABLE DEFINITION: drizzle names EVERY schema column in
 * every INSERT it builds, supplying `default` for keys you omit — verified
 * empirically against this repo's drizzle (`.toSQL()` on an insert with the
 * key removed still reads `..., "amount_htg") values (..., default)`). So
 * the old "retry the insert without the amountHtg KEY" fallback in
 * lib/payments/moncash-fulfill.ts never worked: the retry emitted the same
 * unknown column and failed identically — on the LIVE money path, after the
 * buyer's gourdes had already moved. Omitting a column from the SQL requires
 * a table object that does not know the column exists. This is that object.
 *
 * MUST list exactly the columns migration 0018-era production has. It maps
 * to the same physical table ('payments'), so it must never be used for
 * anything but the missing-column retry.
 */
export const paymentsPre0019 = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  provider: text('provider').$type<'stripe' | 'paypal' | 'moncash' | 'natcash' | 'crypto'>().notNull(),
  providerRef: text('provider_ref'),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull(),
  productType: text('product_type').$type<'course' | 'subscription'>().notNull(),
  courseSlug: text('course_slug'),
  relatedSubscriptionId: uuid('related_subscription_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Every `payments` column except the possibly-missing `amount_htg`. */
export const PAYMENTS_COLUMNS_PRE_0019 = {
  id: payments.id,
  userId: payments.userId,
  provider: payments.provider,
  providerRef: payments.providerRef,
  amountCents: payments.amountCents,
  currency: payments.currency,
  status: payments.status,
  productType: payments.productType,
  courseSlug: payments.courseSlug,
  relatedSubscriptionId: payments.relatedSubscriptionId,
  createdAt: payments.createdAt,
} as const;

/**
 * Runs `full` (a `db.select().from(payments)...` chain naming every column).
 * On a missing-`amount_htg` failure, runs `fallback` — the IDENTICAL chain
 * built off `PAYMENTS_COLUMNS_PRE_0019` instead of a bare `.select()` — and
 * grandfathers `amountHtg` to `null` on every row, the same value the real
 * column defaults every pre-existing row to once `db:push` finally runs.
 *
 * NOT itself never-throw: a failure that isn't the missing column rethrows,
 * exactly like `isMissingColumnError`'s other callers, so callers keep their
 * own error handling (or lack of it) unchanged.
 *
 * Constrained only to "has an `amountHtg` field" (not the full `payments` row
 * shape) so it also composes with a narrowed `.select({...})` projection —
 * every real call site still passes full `payments` rows in practice.
 */
export async function paymentsSelectSafe<T extends { amountHtg: number | null }>(
  full: () => Promise<T[]>,
  fallback: () => Promise<Omit<T, 'amountHtg'>[]>,
): Promise<T[]> {
  try {
    return await full();
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    console.warn(
      '[db] payments read fell back to pre-migration columns (no amount_htg) — run `npm run db:push`.',
    );
    const rows = await fallback();
    return rows.map((r) => ({ ...r, amountHtg: null })) as T[];
  }
}
