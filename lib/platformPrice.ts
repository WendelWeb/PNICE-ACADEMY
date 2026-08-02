/**
 * lib/platformPrice.ts — the single source of truth for the "Pass PNICE"
 * (all-access) subscription price (`platform_settings.platform_pass_usd_cents`).
 * Task: two subscription products — mirrors lib/fx.ts's `getFxRate`/`setFxRate`
 * exactly (same table, same singleton-row pattern, same gating).
 *
 * This is the OWNER's price for the all-access pass — distinct from a
 * `teacher_plans` row, which is a TEACHER's own price for their own catalogue
 * only (lib/teacher/studio-actions.ts's `updateMyPlanAction`). Never conflate
 * the two: lib/payments/products.ts's `resolveDefaultSubscription` (the
 * `/checkout?plan=sub` / bare-subscription path, no `?teacher=` param) is the
 * ONLY caller that charges this price; a per-teacher checkout always reads
 * that teacher's own plan instead.
 *
 * GATED + NEVER-THROW on read, mirroring lib/fx.ts's `getFxRate` /
 * lib/teacher/profile.ts's `getCommissionPct`: no DATABASE_URL, no settings
 * row, an invalid/non-positive stored value, or a failed query ⇒ fall back to
 * the constant (`data/pricing.ts`'s `SUBSCRIPTION_USD * 100`) — never throws.
 * This is what keeps checkout/dev/build working with no live DB: the
 * platform pass still has a real price, just not the admin-editable one.
 *
 * The WRITER (`setPlatformPassPriceCents`) is the opposite: it throws on a
 * genuinely bad call (no DB configured, or an invalid price) — same division
 * of labour as lib/fx.ts's `setFxRate`, whose caller (a 'use server' admin
 * action) already wraps every admin action in try/catch and turns a thrown
 * error into a surfaced failure message.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { SUBSCRIPTION_USD } from '@/data/pricing';

const T = schema;
const SUB_CENTS = SUBSCRIPTION_USD * 100;

/**
 * Pure: validate + round a platform-pass price in cents — the ONE place this
 * guard lives (mirrors lib/teacher/earnings.ts's `splitEarnings`). Throws on
 * a non-finite or non-positive value. Exported for unit testing without a DB.
 */
export function normalizePlatformPassCents(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error('invalid_price');
  }
  return Math.round(cents);
}

/**
 * The live "Pass PNICE" price in USD cents. GATED + FALLBACK: no
 * DATABASE_URL, no settings row, a non-positive/invalid stored value, or a
 * failed query ⇒ the constant (`SUBSCRIPTION_USD * 100`), never throws. Also
 * the safe landing spot while a `db:push` for this task's migration is still
 * pending on a live DB — a `platform_pass_usd_cents` column that doesn't
 * exist yet fails the query, caught below, and falls back to the SAME value
 * the column's own schema default would produce once applied.
 */
export async function getPlatformPassPriceCents(): Promise<number> {
  if (!dbConfigured()) return SUB_CENTS;
  try {
    const [row] = await db
      .select()
      .from(T.platformSettings)
      .where(eq(T.platformSettings.id, 'singleton'))
      .limit(1);
    const stored = row?.platformPassUsdCents;
    return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : SUB_CENTS;
  } catch (err) {
    console.error('[platformPrice] getPlatformPassPriceCents DB read failed, falling back to default:', err);
    return SUB_CENTS;
  }
}

/**
 * Upsert the `platform_settings` singleton's `platform_pass_usd_cents` — the
 * /admin/prix save action's write path (lib/admin/actions.ts's
 * `setPlatformPassPriceAction`). Same insert-or-onConflictDoUpdate shape as
 * lib/fx.ts's `setFxRate`. Throws (does not swallow) on an invalid price or a
 * missing DB — the caller already wraps every admin action in try/catch.
 */
export async function setPlatformPassPriceCents(cents: number): Promise<void> {
  const rounded = normalizePlatformPassCents(cents);
  if (!dbConfigured()) throw new Error('db_required');
  await db
    .insert(T.platformSettings)
    .values({ id: 'singleton', subscriptionUsdCents: SUB_CENTS, platformPassUsdCents: rounded })
    .onConflictDoUpdate({
      target: T.platformSettings.id,
      set: { platformPassUsdCents: rounded, updatedAt: new Date() },
    });
}
