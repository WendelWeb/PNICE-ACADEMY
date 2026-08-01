/**
 * Unit tests for lib/teacher/profile.ts (Task C3-T1) — the pure balance-sum
 * logic and the gated fallback (no DATABASE_URL ⇒ null/false/0/[]/defaults,
 * never throws). No live DB is touched: this test environment has no
 * DATABASE_URL set (vitest.config.ts doesn't load .env.local, unlike
 * drizzle.config.ts — see lib/courses/source.test.ts's header for the same
 * reasoning), so every exported read function runs its fallback path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  sumNetCents,
  mapDbTeacherProfile,
  mapDbLedgerRow,
  mapDbWithdrawalRow,
  getTeacherProfile,
  isApprovedTeacher,
  getTeacherBalanceCents,
  getTeacherLedger,
  getWithdrawals,
  getCommissionPct,
  getPayoutThresholdCents,
  type LedgerRow,
} from './profile';

describe('sumNetCents — the ONE place a teacher balance is computed', () => {
  it('sums positive sale rows', () => {
    const rows: Pick<LedgerRow, 'netCents'>[] = [{ netCents: 7000 }, { netCents: 3000 }];
    expect(sumNetCents(rows)).toBe(10000);
  });

  it('subtracts negative refund/withdrawal rows', () => {
    const rows: Pick<LedgerRow, 'netCents'>[] = [
      { netCents: 7000 }, // sale
      { netCents: -2000 }, // refund
      { netCents: -1000 }, // withdrawal
    ];
    expect(sumNetCents(rows)).toBe(4000);
  });

  it('returns 0 for an empty ledger', () => {
    expect(sumNetCents([])).toBe(0);
  });

  it('can go negative (refund exceeding prior sales)', () => {
    const rows: Pick<LedgerRow, 'netCents'>[] = [{ netCents: 1000 }, { netCents: -1500 }];
    expect(sumNetCents(rows)).toBe(-500);
  });
});

describe('mapDbTeacherProfile — DB row → TeacherProfile shape', () => {
  const fakeRow = {
    id: 'tp-1',
    userId: 'user-1',
    slug: 'pwofese-jan',
    displayName: 'Pwofesè Jan',
    bioHt: 'Bio ht',
    bioFr: 'Bio fr',
    photoUrl: 'https://example.com/photo.jpg',
    status: 'approved' as const,
    payoutMethod: 'moncash' as const,
    payoutDestination: '+509 1234 5678',
    videoQuotaMinutes: 600,
    termsAcceptedAt: new Date('2026-01-01T00:00:00Z'),
    reviewNote: 'ok',
    reviewedBy: 'admin-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  it('maps every field, converting timestamps to ISO strings', () => {
    const mapped = mapDbTeacherProfile(fakeRow);
    expect(mapped).toEqual({
      id: 'tp-1',
      userId: 'user-1',
      slug: 'pwofese-jan',
      displayName: 'Pwofesè Jan',
      bioHt: 'Bio ht',
      bioFr: 'Bio fr',
      photoUrl: 'https://example.com/photo.jpg',
      status: 'approved',
      payoutMethod: 'moncash',
      payoutDestination: '+509 1234 5678',
      videoQuotaMinutes: 600,
      termsAcceptedAt: '2026-01-01T00:00:00.000Z',
      reviewNote: 'ok',
      reviewedBy: 'admin-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('falls back to null for nullable columns', () => {
    const sparseRow = {
      ...fakeRow,
      displayName: null,
      bioHt: null,
      bioFr: null,
      photoUrl: null,
      payoutMethod: null,
      payoutDestination: null,
      videoQuotaMinutes: null,
      termsAcceptedAt: null,
      reviewNote: null,
      reviewedBy: null,
    };
    const mapped = mapDbTeacherProfile(sparseRow);
    expect(mapped.displayName).toBeNull();
    expect(mapped.payoutMethod).toBeNull();
    expect(mapped.termsAcceptedAt).toBeNull();
  });
});

describe('mapDbLedgerRow / mapDbWithdrawalRow — DB row → app shape', () => {
  it('maps a sale ledger row', () => {
    const row = mapDbLedgerRow({
      id: 'led-1',
      teacherUserId: 'user-1',
      paymentId: 'pay-1',
      kind: 'sale' as const,
      grossCents: 10000,
      commissionPctApplied: 30,
      commissionCents: 3000,
      netCents: 7000,
      currency: 'USD',
      note: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(row).toEqual({
      id: 'led-1',
      teacherUserId: 'user-1',
      paymentId: 'pay-1',
      kind: 'sale',
      grossCents: 10000,
      commissionPctApplied: 30,
      commissionCents: 3000,
      netCents: 7000,
      currency: 'USD',
      note: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('maps a withdrawal row, nulling optional fields', () => {
    const row = mapDbWithdrawalRow({
      id: 'w-1',
      teacherUserId: 'user-1',
      amountCents: 5000,
      method: null,
      destinationSnapshot: null,
      status: 'pending' as const,
      processedBy: null,
      processedAt: null,
      reference: null,
      note: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(row.status).toBe('pending');
    expect(row.processedAt).toBeNull();
  });
});

describe('gated fallback — no DATABASE_URL (never throws)', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('getTeacherProfile returns null', async () => {
    delete process.env.DATABASE_URL;
    expect(await getTeacherProfile('any-user')).toBeNull();
  });

  it('isApprovedTeacher returns false', async () => {
    delete process.env.DATABASE_URL;
    expect(await isApprovedTeacher('any-user')).toBe(false);
  });

  it('getTeacherBalanceCents returns 0', async () => {
    delete process.env.DATABASE_URL;
    expect(await getTeacherBalanceCents('any-user')).toBe(0);
  });

  it('getTeacherLedger returns []', async () => {
    delete process.env.DATABASE_URL;
    expect(await getTeacherLedger('any-user')).toEqual([]);
  });

  it('getWithdrawals returns []', async () => {
    delete process.env.DATABASE_URL;
    expect(await getWithdrawals('any-user')).toEqual([]);
  });

  it('getCommissionPct returns the spec default (30)', async () => {
    delete process.env.DATABASE_URL;
    expect(await getCommissionPct()).toBe(30);
  });

  it('getPayoutThresholdCents returns the spec default ($25 = 2500 cents)', async () => {
    delete process.env.DATABASE_URL;
    expect(await getPayoutThresholdCents()).toBe(2500);
  });
});
