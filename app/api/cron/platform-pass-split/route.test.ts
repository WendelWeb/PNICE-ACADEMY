/**
 * Auth-gate smoke tests for the platform-pass-split cron route — the two
 * paths that don't require a live DATABASE_URL, mirroring
 * app/api/cron/daily-digest/route.test.ts exactly. The DB-hitting split/
 * persist path is exercised by lib/teacher/platform-pass-payout.ts and the
 * pure math it wraps (lib/teacher/platform-pass-split.test.ts), and verified
 * against a live DB the same way the rest of the payout layer is.
 */
import { describe, it, expect, afterEach } from 'vitest';

describe('GET /api/cron/platform-pass-split — auth gate', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('./route');
    const res = await GET(new Request('https://x.test/api/cron/platform-pass-split'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('not_configured');
  });

  it('returns 401 with a wrong bearer', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const { GET } = await import('./route');
    const res = await GET(
      new Request('https://x.test/api/cron/platform-pass-split', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('skips safely with the right bearer but no DATABASE_URL, and still reports the target period', async () => {
    process.env.CRON_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;
    const { GET } = await import('./route');
    const res = await GET(
      new Request('https://x.test/api/cron/platform-pass-split', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.skipped).toBe(true);
    expect(body.period).toMatch(/^\d{4}-\d{2}$/);
  });
});
