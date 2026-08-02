import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// The Neon serverless driver doesn't actually CONNECT until a query runs —
// but it does validate eagerly that it was handed *some* well-formed
// connection string: `neon('')` throws synchronously at construction time
// (unlike the empty string this module used to pass). A harmless placeholder
// keeps construction inert with no DATABASE_URL set — nothing ever queries
// it, since every real caller gates on `process.env.DATABASE_URL` before
// touching `db` (see lib/learner/access.ts's dbReady() and every
// lib/admin/data/real/*.ts / app/api/**/route.ts caller) — so importing
// `@/db` stays safe without DATABASE_URL, exactly as originally intended.
const sql = neon(process.env.DATABASE_URL || 'postgresql://placeholder@localhost/no_database_configured');

export const db = drizzle(sql, { schema });
export { schema };

/**
 * True for a Postgres `undefined_column` failure (42703), unwrapped from
 * drizzle-orm's `DrizzleQueryError` — the ONE place this is detected, shared
 * by every "the live DB might still lag a migration the owner applies
 * manually with `db:push`" retry (lib/payments/fulfill.ts's
 * `insertSubscriptionRow`/`selectSubscriptionByProviderRef`,
 * lib/learner/access.ts's subscription reads — see db/migrations/0015's
 * header for the migration this specifically protects). A bare
 * `db.select()` names EVERY schema column, so one not-yet-applied column
 * fails the WHOLE query; this lets a caller retry with an explicit
 * pre-migration column list instead of the read/write failing outright.
 * Verified against a live pre-migration Neon DB during development — this is
 * the exact shape `@neondatabase/serverless` throws.
 */
export function isMissingColumnError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: unknown } } | undefined)?.cause;
  return typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === '42703';
}
