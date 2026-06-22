import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// The Neon serverless driver is lazy — it doesn't connect until a query runs,
// so importing this without DATABASE_URL set is safe (nothing queries it yet).
const sql = neon(process.env.DATABASE_URL ?? '');

export const db = drizzle(sql, { schema });
export { schema };
