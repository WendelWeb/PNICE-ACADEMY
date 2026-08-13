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
import { payments } from './schema';
import { isMissingColumnError } from './index';

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
