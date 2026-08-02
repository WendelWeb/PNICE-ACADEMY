/**
 * Gated-path tests for lib/teacher/platform-pass-payout.ts — the "no
 * DATABASE_URL ⇒ safe empty result, never throws" contract every DB-adjacent
 * module in this codebase guarantees (mirrors lib/learner/access.ts's
 * `dbReady()` tests / lib/teacher/payouts.ts's `dbConfigured()` gate). The
 * DB-hitting aggregation/persistence path is exercised indirectly by the
 * pure math it wraps (lib/teacher/platform-pass-split.test.ts) and verified
 * against a live DB, same as the rest of this money-critical layer.
 */
import { describe, it, expect, afterEach } from 'vitest';

describe('platform-pass-payout — gated with no DATABASE_URL', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('getPlatformPassPeriodView falls back to an all-zero, uncomputed view', async () => {
    delete process.env.DATABASE_URL;
    const { getPlatformPassPeriodView } = await import('./platform-pass-payout');
    const view = await getPlatformPassPeriodView('2026-07');
    expect(view).toEqual({
      period: '2026-07',
      computed: false,
      grossCents: 0,
      commissionPct: 0,
      ownPoolCents: 0,
      carryInCents: 0,
      totalPoolCents: 0,
      consumptionTotal: 0,
      distributedCents: 0,
      carryOutCents: 0,
      computedBy: null,
      computedAt: null,
      shares: [],
    });
  });

  it('listPlatformPassPeriods falls back to []', async () => {
    delete process.env.DATABASE_URL;
    const { listPlatformPassPeriods } = await import('./platform-pass-payout');
    await expect(listPlatformPassPeriods()).resolves.toEqual([]);
  });

  it('runPlatformPassSplitForPeriod refuses to run with db_required, never throws', async () => {
    delete process.env.DATABASE_URL;
    const { runPlatformPassSplitForPeriod } = await import('./platform-pass-payout');
    const result = await runPlatformPassSplitForPeriod('2026-07', null);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('db_required');
    expect(result.view.computed).toBe(false);
  });

  it('runPlatformPassSplitForPeriod resolves without throwing for a manual admin actor too', async () => {
    delete process.env.DATABASE_URL;
    const { runPlatformPassSplitForPeriod } = await import('./platform-pass-payout');
    await expect(
      runPlatformPassSplitForPeriod('2026-07', { id: 'admin-1', name: 'Owner' }),
    ).resolves.toMatchObject({ ok: false, message: 'db_required' });
  });
});
