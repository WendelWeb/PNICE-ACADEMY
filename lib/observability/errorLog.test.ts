/**
 * Production hardening pass — lib/observability/errorLog.ts's `logAppError`:
 *  - no-ops (never touches `db`) with no DATABASE_URL, mirroring every other
 *    gated writer in this codebase;
 *  - with DATABASE_URL set, inserts one row keyed by a fingerprint derived
 *    from route+message and upserts on conflict (the "increments `count` on
 *    repeat" contract db/schema.ts's errorLogs comment documents);
 *  - never throws even if the underlying insert rejects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  inserts: [] as { values: AnyRow; conflictTarget: unknown; conflictSet: AnyRow }[],
  insertShouldThrow: false,
}));

vi.mock('@/db', async () => {
  const schema = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  const makeInsert = () => {
    const rec = { values: {} as AnyRow, conflictTarget: undefined as unknown, conflictSet: {} as AnyRow };
    dbState.inserts.push(rec);
    const b: Record<string, unknown> = {};
    b.values = (v: AnyRow) => {
      rec.values = v;
      return b;
    };
    b.onConflictDoUpdate = (opts: { target: unknown; set: AnyRow }) => {
      rec.conflictTarget = opts.target;
      rec.conflictSet = opts.set;
      return b;
    };
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      (dbState.insertShouldThrow ? Promise.reject(new Error('db down')) : Promise.resolve([])).then(onF, onR);
    return b;
  };
  return {
    db: { insert: () => makeInsert() },
    schema,
    isMissingColumnError: () => false,
  };
});

import { logAppError } from './errorLog';

describe('logAppError', () => {
  beforeEach(() => {
    dbState.inserts = [];
    dbState.insertShouldThrow = false;
    delete process.env.DATABASE_URL;
  });

  it('no-ops with no DATABASE_URL — never touches the DB', async () => {
    await logAppError({ message: 'boom', route: '/x' });
    expect(dbState.inserts).toHaveLength(0);
  });

  it('inserts a fingerprinted row keyed on route+message, with an upsert path that bumps count', async () => {
    process.env.DATABASE_URL = 'postgres://mock/mock';
    await logAppError({ message: 'boom', route: '/formations/x', stack: 'at foo()' });
    expect(dbState.inserts).toHaveLength(1);
    const row = dbState.inserts[0];
    expect(row.values.message).toBe('boom');
    expect(row.values.route).toBe('/formations/x');
    expect(row.values.fingerprint).toEqual(expect.any(String));
    expect((row.values.fingerprint as string).length).toBeGreaterThan(10);
    expect(row.values.count).toBe(1);
    // The conflict target is the unique fingerprint column, and the update
    // set never touches `firstAt` (only a genuinely new fingerprint should
    // set that) — it bumps count/lastAt/stackTruncated on repeat.
    expect(row.conflictSet).toHaveProperty('lastAt');
    expect(row.conflictSet).toHaveProperty('count');
    expect(row.conflictSet).not.toHaveProperty('firstAt');
  });

  it('the same message+route fingerprints identically; a different route does not', async () => {
    process.env.DATABASE_URL = 'postgres://mock/mock';
    await logAppError({ message: 'same', route: '/a' });
    await logAppError({ message: 'same', route: '/a' });
    await logAppError({ message: 'same', route: '/b' });
    const [first, second, third] = dbState.inserts;
    expect(first.values.fingerprint).toBe(second.values.fingerprint);
    expect(first.values.fingerprint).not.toBe(third.values.fingerprint);
  });

  it('never throws even when the insert rejects', async () => {
    process.env.DATABASE_URL = 'postgres://mock/mock';
    dbState.insertShouldThrow = true;
    await expect(logAppError({ message: 'boom' })).resolves.toBeUndefined();
  });

  it('caps an oversized message/stack instead of writing an unbounded row', async () => {
    process.env.DATABASE_URL = 'postgres://mock/mock';
    await logAppError({ message: 'x'.repeat(5000), stack: 'y'.repeat(10000) });
    const row = dbState.inserts[0];
    expect((row.values.message as string).length).toBeLessThanOrEqual(2000);
    expect((row.values.stackTruncated as string).length).toBeLessThanOrEqual(4000);
  });
});
