/**
 * Auth-gate smoke tests for the abandoned-carts cron route — the two paths
 * that don't require a live DATABASE_URL. The DB-hitting 200 path is
 * verified against a live DB via a curl (see docs/launch-checklist.md /
 * the L5 report), same as scripts/check-payments.ts / check-learner.ts do
 * for other DB-only behaviour.
 */
import { describe, it, expect, afterEach } from 'vitest';

describe('GET /api/cron/abandoned-carts — auth gate', () => {
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
    const res = await GET(new Request('https://x.test/api/cron/abandoned-carts'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('not_configured');
  });

  it('returns 401 with a wrong bearer', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const { GET } = await import('./route');
    const res = await GET(
      new Request('https://x.test/api/cron/abandoned-carts', {
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 with no Authorization header at all', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const { GET } = await import('./route');
    const res = await GET(new Request('https://x.test/api/cron/abandoned-carts'));
    expect(res.status).toBe(401);
  });

  it('returns zeros safely with the right bearer but no DATABASE_URL', async () => {
    process.env.CRON_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;
    const { GET } = await import('./route');
    const res = await GET(
      new Request('https://x.test/api/cron/abandoned-carts', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ markedAbandoned: 0, remindersSent: 0 });
  });
});
