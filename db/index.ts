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
