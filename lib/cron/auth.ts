/**
 * Shared `CRON_SECRET` bearer guard for Vercel Cron routes (Task L5).
 * Mirrors the env-gate pattern of app/api/webhooks/clerk/route.ts and
 * app/api/webhooks/stripe/route.ts: no secret configured → the route isn't
 * wired yet (503); secret configured but the caller's bearer doesn't match →
 * unauthorized (401). Vercel Cron invocations send
 * `Authorization: Bearer <CRON_SECRET>` automatically.
 *
 * Exported as a pure function (reads one header value in, a result out) so
 * it's unit-testable without constructing a real Request/Response — see
 * lib/cron/auth.test.ts.
 *
 * SECURITY: never logs the header or the secret; compares with
 * `timingSafeEqual` to avoid a timing side-channel on the bearer value.
 */
import { timingSafeEqual } from 'node:crypto';

export type CronAuthResult = 'ok' | 'not_configured' | 'unauthorized';

export function checkCronAuth(authHeader: string | null): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) return 'not_configured';
  if (!authHeader) return 'unauthorized';

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  if (actual.length !== expected.length) return 'unauthorized';
  return timingSafeEqual(actual, expected) ? 'ok' : 'unauthorized';
}

/** Maps a CronAuthResult to the HTTP status the route should return, or null when auth passed. */
export function cronAuthStatus(result: CronAuthResult): 503 | 401 | null {
  if (result === 'not_configured') return 503;
  if (result === 'unauthorized') return 401;
  return null;
}
