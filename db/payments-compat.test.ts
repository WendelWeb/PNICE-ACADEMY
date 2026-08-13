/**
 * Unit test for db/payments-compat.ts's `paymentsSelectSafe` — the shared
 * migration-lag fallback every bare `payments` read across the app now goes
 * through (see that module's own header for the full list of call sites this
 * protects: the learner's receipt download, /kont's purchase history, the
 * Stripe refund webhook, and most of /admin).
 *
 * Uses the REAL `isMissingColumnError` from `./index` (a pure function —
 * importing `db/index.ts` is inert with no DATABASE_URL, per its own
 * comment), so this test proves the actual production wiring, not a mock of
 * it.
 */
import { describe, it, expect, vi } from 'vitest';
import { paymentsSelectSafe } from './payments-compat';

type Row = { id: string; amountHtg: number | null };

function missingColumnError(): Error {
  const err = new Error('column "amount_htg" does not exist') as Error & { cause?: unknown };
  err.cause = { code: '42703' };
  return err;
}

describe('paymentsSelectSafe', () => {
  it('returns the full-select result unchanged when the column exists', async () => {
    const full = vi.fn(async (): Promise<Row[]> => [{ id: 'p1', amountHtg: 264 }]);
    const fallback = vi.fn(async (): Promise<Omit<Row, 'amountHtg'>[]> => [{ id: 'p1' }]);
    const rows = await paymentsSelectSafe(full, fallback);
    expect(rows).toEqual([{ id: 'p1', amountHtg: 264 }]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back and grandfathers amountHtg to null on a missing-column failure', async () => {
    const full = vi.fn(async (): Promise<Row[]> => {
      throw missingColumnError();
    });
    const fallback = vi.fn(async (): Promise<Omit<Row, 'amountHtg'>[]> => [{ id: 'p1' }, { id: 'p2' }]);
    const rows = await paymentsSelectSafe(full, fallback);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([
      { id: 'p1', amountHtg: null },
      { id: 'p2', amountHtg: null },
    ]);
  });

  it('rethrows any other failure — never masks a genuine DB error as a migration lag', async () => {
    const boom = new Error('connection reset');
    const full = vi.fn(async (): Promise<Row[]> => {
      throw boom;
    });
    const fallback = vi.fn(async (): Promise<Omit<Row, 'amountHtg'>[]> => [{ id: 'p1' }]);
    await expect(paymentsSelectSafe(full, fallback)).rejects.toBe(boom);
    expect(fallback).not.toHaveBeenCalled();
  });
});
