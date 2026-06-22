import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't auto-load .env.local — do it here.
config({ path: '.env.local' });

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
