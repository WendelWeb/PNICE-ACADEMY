/**
 * Unit test for db/index.ts's `isMissingColumnError` (Task: two subscription
 * products, migration-lag resilience) — the ONE place a Postgres
 * "undefined_column" failure (42703) is distinguished from any other query
 * error, so lib/payments/fulfill.ts's `insertSubscriptionRow`/
 * `selectSubscriptionByProviderRef` (and lib/learner/access.ts's own
 * subscription reads) know when it's safe to retry without the
 * not-yet-migrated `kind` column versus letting a genuine failure propagate.
 * Verified against the LIVE (pre-migration) DB's actual NeonDbError shape
 * during development — `cause.code === '42703'`, exactly what this checks.
 */
import { describe, it, expect } from 'vitest';
import { isMissingColumnError } from './index';

describe('isMissingColumnError', () => {
  it('recognizes a drizzle-wrapped Postgres undefined_column error (code 42703)', () => {
    const err = { cause: { code: '42703', message: 'column "kind" does not exist' } };
    expect(isMissingColumnError(err)).toBe(true);
  });

  it('rejects an unrelated Postgres error code', () => {
    const err = { cause: { code: '23505', message: 'duplicate key value' } };
    expect(isMissingColumnError(err)).toBe(false);
  });

  it('rejects a plain Error with no cause', () => {
    expect(isMissingColumnError(new Error('network down'))).toBe(false);
  });

  it('never throws on garbage input', () => {
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
    expect(isMissingColumnError('a string')).toBe(false);
    expect(isMissingColumnError(42)).toBe(false);
    expect(isMissingColumnError({ cause: null })).toBe(false);
    expect(isMissingColumnError({ cause: 'oops' })).toBe(false);
  });
});
