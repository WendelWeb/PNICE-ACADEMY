/**
 * Prints the most recent payment-flow rows from the live DB.
 * Usage: npm run db:check-payments
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing in .env.local');
    process.exit(1);
  }
  // Import AFTER dotenv so the db client sees the env (same as sync-clerk-users).
  const { db } = await import('../db');
  const { payments, enrollments, subscriptions, webhookLogs } = await import('../db/schema');
  const { desc } = await import('drizzle-orm');

  const pay = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(10);
  const enr = await db.select().from(enrollments).orderBy(desc(enrollments.purchasedAt)).limit(10);
  const subs = await db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt)).limit(10);
  const hooks = await db.select().from(webhookLogs).orderBy(desc(webhookLogs.receivedAt)).limit(10);

  console.log(`\n── payments (${pay.length}) ──`);
  for (const p of pay)
    console.log(`${p.createdAt.toISOString()}  ${p.status.padEnd(9)} ${p.productType.padEnd(12)} $${(p.amountCents / 100).toFixed(2)}  ${p.courseSlug ?? '—'}  ref=${p.providerRef ?? '—'}`);
  console.log(`\n── enrollments (${enr.length}) ──`);
  for (const e of enr) console.log(`${e.purchasedAt.toISOString()}  ${e.status.padEnd(9)} ${e.courseSlug}`);
  console.log(`\n── subscriptions (${subs.length}) ──`);
  for (const s of subs)
    console.log(`${s.createdAt.toISOString()}  ${s.status.padEnd(9)} period_end=${s.currentPeriodEnd?.toISOString() ?? '—'} ref=${s.providerRef ?? '—'}`);
  console.log(`\n── webhook_logs (${hooks.length}) ──`);
  for (const w of hooks)
    console.log(`${w.receivedAt.toISOString()}  ${w.status.padEnd(9)} ${w.provider}:${w.eventType} ${w.errorMessage ?? ''}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✗ Échec :', e instanceof Error ? e.message : e);
    process.exit(1);
  });
