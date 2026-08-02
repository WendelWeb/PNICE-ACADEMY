/**
 * Monthly "Pass PNICE" pro-rata payout cron (Task: pro-rata split of PNICE
 * all-access revenue). Vercel Cron hits this once a month (see vercel.json).
 * Same CRON_SECRET bearer guard as abandoned-carts/daily-digest
 * (lib/cron/auth.ts) — no secret configured → 503, wrong/absent bearer → 401.
 *
 * Distributes the PREVIOUS calendar month's platform-pass pool — by the time
 * this runs (early in the new month), last month is fully closed and every
 * qualifying `progress.completedAt` for it has landed. See
 * lib/teacher/platform-pass-payout.ts for the actual read/split/persist and
 * lib/teacher/platform-pass-split.ts for the pure pro-rata math.
 *
 * NEVER THROWS: `runPlatformPassSplitForPeriod` is itself gated + try/catch
 * (no DATABASE_URL ⇒ `{ ok: false, message: 'db_required' }`); this route
 * adds its own belt-and-suspenders try/catch on top, same as every other
 * cron here. Idempotent: re-running for the same month (a retried
 * invocation, or the owner ALSO clicking "lancer la répartition" on
 * /admin/repartition for the same period) is a documented no-op — see that
 * module's header.
 */
import { runPlatformPassSplitForPeriod } from '@/lib/teacher/platform-pass-payout';
import { monthPeriodOf, previousMonthPeriod } from '@/lib/teacher/platform-pass-split';
import { checkCronAuth, cronAuthStatus } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const authResult = checkCronAuth(req.headers.get('authorization'));
  const status = cronAuthStatus(authResult);
  if (status) return Response.json({ error: authResult }, { status });

  const period = previousMonthPeriod(monthPeriodOf(new Date()));

  if (!process.env.DATABASE_URL) {
    return Response.json({ period, ok: false, skipped: true, reason: 'not_configured' });
  }

  try {
    const result = await runPlatformPassSplitForPeriod(period, null);
    return Response.json({
      period,
      ok: result.ok,
      message: result.message,
      totalPoolCents: result.view.totalPoolCents,
      distributedCents: result.view.distributedCents,
      carryOutCents: result.view.carryOutCents,
      teacherCount: result.view.shares.length,
    });
  } catch (e) {
    console.error('[cron:platform-pass-split] failed:', e instanceof Error ? e.message : e);
    return Response.json({ period, ok: false, error: 'processing_error' }, { status: 500 });
  }
}
