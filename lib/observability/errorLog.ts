/**
 * Production hardening pass — real writer for the `error_logs` table.
 *
 * Before this file, NOTHING ever inserted into `error_logs`: the two React
 * error boundaries (app/global-error.tsx, app/[locale]/error.tsx) only
 * `console.error`'d, and no server code path recorded a failure either — so
 * /admin/sante's "Error logs" panel could never show anything, even during a
 * real incident (its own read path, getErrorLogs() in
 * lib/admin/data/real/support.ts, was always correct — just fed by nothing).
 *
 * `logAppError` is the one writer, called from two places:
 *   1. `lib/observability/actions.ts`'s `logClientErrorAction` — a server
 *      action the two client error boundaries call in a `useEffect`, mirror-
 *      ing the existing client→server-action pattern already used by
 *      components/UtmCapture.tsx → lib/site-actions-public.ts.
 *   2. app/api/webhooks/stripe/route.ts's failed-outcome branch — the single
 *      highest-value server-side source of real production errors on the
 *      money path.
 *
 * Groups by `fingerprint` = sha256(route + "::" + message), matching the
 * schema's documented intent (db/schema.ts's errorLogs comment): a repeat of
 * the same message+route increments `count`/bumps `lastAt` instead of
 * growing the table unboundedly. Env-gated on DATABASE_URL and NEVER THROWS
 * — this is diagnostics, not a money path; a failure here must never surface
 * to the caller (mirrors lib/payments/promo-redemption.ts's
 * `recordPromoRedemption` shape exactly).
 */
import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/db';

const T = schema;

export type LogAppErrorInput = {
  message: string;
  route?: string | null;
  stack?: string | null;
};

function fingerprintOf(message: string, route: string): string {
  return crypto.createHash('sha256').update(`${route}::${message}`).digest('hex');
}

export async function logAppError(input: LogAppErrorInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const message = (input.message || 'error').trim().slice(0, 2000);
    const route = (input.route || '').trim().slice(0, 300) || null;
    const stackTruncated = input.stack ? input.stack.trim().slice(0, 4000) : null;
    const fingerprint = fingerprintOf(message, route ?? '');
    const now = new Date();

    await db
      .insert(T.errorLogs)
      .values({ fingerprint, message, route, stackTruncated, count: 1, firstAt: now, lastAt: now })
      .onConflictDoUpdate({
        target: T.errorLogs.fingerprint,
        set: { count: sql`${T.errorLogs.count} + 1`, lastAt: now, stackTruncated },
      });
  } catch (err) {
    console.error('[observability] logAppError failed:', err instanceof Error ? err.message : err);
  }
}
