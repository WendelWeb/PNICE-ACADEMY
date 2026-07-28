/**
 * lib/fx.ts — the single source of truth for the USD→HTG DISPLAY rate
 * (`platform_settings.fx_rate_htg`). Task fix/fx-rate-unify: this replaces
 * THREE previously disconnected FX sources —
 *   - lib/admin/settings.ts's in-memory `fxRate` (admin-only, reset on
 *     restart, not shared across serverless instances, never persisted),
 *   - lib/money.ts's build-time `USD_TO_HTG` env constant (what the public
 *     price display actually used),
 *   - this DB column, which existed but was never read/written for FX —
 * with one: every reader (public price display via
 * components/ui/FxRateProvider.tsx, the admin FX panel, receipts) reads
 * this column; the only writer is `setFxRate` below (the admin FX panel's
 * save action, lib/admin/actions.ts's `setFxRateAction`).
 *
 * GATED + NEVER-THROW, mirroring lib/teacher/profile.ts's `getCommissionPct`
 * exactly: no DATABASE_URL, no settings row, an invalid/non-positive stored
 * value, or a failed query ⇒ fall back to the env constant
 * (lib/money.ts's `USD_TO_HTG`) — never throws. This is what keeps dev/
 * build/mock working with no live DB: public pages still show a HTG price,
 * just not the admin-editable one.
 *
 * DISPLAY-ONLY: nothing here touches the Stripe charge amount, which is
 * always computed in USD cents (lib/payments/products.ts, untouched by
 * this task).
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { USD_TO_HTG } from '@/lib/money';
import { SUBSCRIPTION_USD } from '@/data/pricing';

const T = schema;
const SUB_CENTS = SUBSCRIPTION_USD * 100;

/**
 * The live USD→HTG display rate (`platform_settings.fx_rate_htg`). GATED +
 * FALLBACK: no DATABASE_URL, no settings row, a non-positive/invalid stored
 * value, or a failed query ⇒ the env constant (lib/money.ts's `USD_TO_HTG`),
 * never throws.
 */
export async function getFxRate(): Promise<number> {
  if (!dbConfigured()) return USD_TO_HTG;
  try {
    const [row] = await db
      .select()
      .from(T.platformSettings)
      .where(eq(T.platformSettings.id, 'singleton'))
      .limit(1);
    const stored = row?.fxRateHtg;
    return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : USD_TO_HTG;
  } catch (err) {
    console.error('[fx] getFxRate DB read failed, falling back to env default:', err);
    return USD_TO_HTG;
  }
}

/**
 * Upsert the `platform_settings` singleton's `fx_rate_htg` — the admin FX
 * panel's write path (lib/admin/actions.ts's `setFxRateAction`). Same
 * insert-or-onConflictDoUpdate shape as
 * lib/admin/data/real/marketing.ts's `setReferralCredit` (seeds
 * `subscriptionUsdCents` on first insert if the singleton row doesn't exist
 * yet). Unlike `getFxRate`, this does not swallow errors — the caller
 * ('use server' action) already wraps every admin action in try/catch and
 * surfaces a failure message, the same division of labour as every other
 * lib/admin/data/real/*.ts writer.
 *
 * ROUNDED before the write: `fx_rate_htg` is an `integer` column but the
 * admin FX input historically allowed fractional steps — an unrounded
 * fractional rate (e.g. 132.5) throws a Postgres integer error on insert.
 * `Math.round` here is the last-resort guard even if every caller already
 * rounds (belt-and-suspenders, mirrors the same rounding in
 * lib/admin/actions.ts's `setFxRateAction`).
 */
export async function setFxRate(rate: number): Promise<void> {
  if (!dbConfigured()) throw new Error('db_required');
  const rounded = Math.round(rate);
  await db
    .insert(T.platformSettings)
    .values({ id: 'singleton', subscriptionUsdCents: SUB_CENTS, fxRateHtg: rounded })
    .onConflictDoUpdate({ target: T.platformSettings.id, set: { fxRateHtg: rounded, updatedAt: new Date() } });
}
