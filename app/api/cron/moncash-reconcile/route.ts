/**
 * MonCash reconciliation cron — the safety net under "paid, but no access".
 *
 * WHY THIS EXISTS. A MonCash purchase is only completed when something calls
 * back and we verify the order with the provider. Three ordinary things break
 * that chain, and until this cron existed NOTHING retried afterwards:
 *
 *   1. The buyer confirms on their handset and closes the browser (or the tab
 *      dies on a weak connection) before the return URL is hit.
 *   2. Bazik/Digicel has a bad minute exactly when the callback lands — the
 *      in-request retry (lib/payments/moncash-order.ts) covers ~1.3 s of that,
 *      no more.
 *   3. The provider's own server-to-server notification never arrives.
 *
 * In all three the gourdes really left the buyer's wallet. This sweeps every
 * still-open MonCash order from the last few days and asks the provider again.
 *
 * SAFE TO RUN ANY NUMBER OF TIMES. `settleMoncashOrder` is idempotent by
 * construction (unique index + onConflictDoNothing on the payment, and an
 * "already enrolled" check before granting), so a re-run of an order that was
 * settled seconds ago returns 'already' and writes nothing. It also never
 * throws — one bad order cannot abort the sweep for the others.
 *
 * ONLY LOOKS BACKWARD A LITTLE. Orders older than the window are left alone:
 * a provider that no longer recognises a stale reference would just log noise
 * every single day, forever. Anything that falls out of the window is a
 * support case, and /admin/transactions now shows it as a failed attempt.
 *
 * Same CRON_SECRET bearer guard as the other crons (lib/cron/auth.ts): no
 * secret configured → 503, wrong/absent bearer → 401. Returns zeros with no
 * DATABASE_URL or no MonCash provider configured.
 */
import { and, gte, isNull, like } from 'drizzle-orm';
import { db, schema } from '@/db';
import { settleMoncashOrder } from '@/lib/payments/moncash-order';
import { moncashConfigured } from '@/lib/payments/moncash';
import { checkCronAuth, cronAuthStatus } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** How far back to sweep. Long enough to cover a weekend outage. */
const WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Don't chase an order the buyer may still be paying right now: the MonCash
 * page is open in front of them, and asking mid-flow just burns a provider
 * call to learn "not yet". The return URL covers that window.
 */
const MIN_AGE_MS = 10 * 60 * 1000;

/**
 * Ceiling on provider calls per run. `maxDuration` is 60 s and each order
 * costs up to ~1.3 s of retries, so an unbounded backlog would time out the
 * function and settle NOTHING. Oldest-first, so a backlog drains a batch per
 * run instead of starving.
 */
const MAX_PER_RUN = 30;

export async function GET(req: Request): Promise<Response> {
  const authResult = checkCronAuth(req.headers.get('authorization'));
  const status = cronAuthStatus(authResult);
  if (status) return Response.json({ error: authResult }, { status });

  if (!process.env.DATABASE_URL || !moncashConfigured()) {
    return Response.json({ checked: 0, granted: 0, already: 0, unpaid: 0, failed: 0, skipped: 'not_configured' });
  }

  const T = schema;
  try {
    const now = Date.now();
    // `sessionId LIKE 'moncash:%'` is what marks a row as MonCash rather than
    // Stripe — the same prefix `isMoncashRef` tests (lib/payments/
    // moncash-order.ts's `encodeMoncashRef`). No schema change needed.
    const open = await db
      .select({ id: T.checkoutSessions.id, startedAt: T.checkoutSessions.startedAt })
      .from(T.checkoutSessions)
      .where(
        and(
          isNull(T.checkoutSessions.completedAt),
          like(T.checkoutSessions.sessionId, 'moncash:%'),
          gte(T.checkoutSessions.startedAt, new Date(now - WINDOW_MS)),
        ),
      )
      .orderBy(T.checkoutSessions.startedAt)
      .limit(MAX_PER_RUN * 4);

    const due = open
      .filter((r) => !r.startedAt || now - r.startedAt.getTime() >= MIN_AGE_MS)
      .slice(0, MAX_PER_RUN);

    const tally = { checked: 0, granted: 0, already: 0, unpaid: 0, failed: 0 };
    for (const row of due) {
      // Sequential on purpose: this talks to a payment provider, and a burst
      // of parallel verifications is exactly what gets an integrator throttled.
      const result = await settleMoncashOrder(row.id);
      tally.checked += 1;
      if (result.status === 'granted') {
        tally.granted += 1;
        console.log(`[cron/moncash-reconcile] recovered order ${row.id} — access granted after the fact`);
      } else if (result.status === 'already') tally.already += 1;
      else if (result.status === 'unpaid') tally.unpaid += 1;
      else tally.failed += 1;
    }

    return Response.json({ ...tally, pending: Math.max(0, open.length - due.length) });
  } catch (e) {
    // Never throw out of a cron: Vercel would just retry the whole sweep.
    console.error('[cron/moncash-reconcile] sweep failed:', e instanceof Error ? e.message : e);
    return Response.json({ error: 'sweep_failed' }, { status: 500 });
  }
}
