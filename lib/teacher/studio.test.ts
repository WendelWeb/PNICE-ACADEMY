/**
 * Unit tests for lib/teacher/studio.ts (Task C3-T4) — the gated-read
 * fallback. No live DB is touched: this test environment has no
 * DATABASE_URL set (vitest.config.ts doesn't load .env.local, same
 * reasoning as lib/teacher/profile.test.ts's header), so every exported
 * read here runs its `dbConfigured() === false` fallback path.
 */
import { describe, it, expect } from 'vitest';
import { getMyCourses, getMyCourse, getMyStudioSummary } from './studio';

describe('lib/teacher/studio.ts — gated reads, no DATABASE_URL', () => {
  it('getMyCourses falls back to [] with no DB', async () => {
    expect(await getMyCourses('user-1')).toEqual([]);
  });

  it('getMyCourse falls back to null with no DB', async () => {
    expect(await getMyCourse('user-1', 'some-course')).toBeNull();
  });

  it('getMyStudioSummary falls back to a safe zeroed summary with no DB', async () => {
    expect(await getMyStudioSummary('user-1')).toEqual({
      balanceCents: 0,
      pendingWithdrawalCents: null,
      thresholdCents: 2500,
      ledger: [],
      videoQuotaMinutes: null,
    });
  });
});
