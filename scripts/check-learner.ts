/**
 * Prints every user + their enrollments/subscriptions/progress/certificates
 * from the live DB, so Task L1 (learner delivery) is verifiable against real
 * data. Usage: npm run db:check-learner
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing in .env.local');
    process.exit(1);
  }
  // Import AFTER dotenv so the db client sees the env (same as check-payments).
  const { db } = await import('../db');
  const { users, enrollments, subscriptions, progress, certificates } = await import('../db/schema');
  const { desc } = await import('drizzle-orm');

  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const allEnrolls = await db.select().from(enrollments);
  const allSubs = await db.select().from(subscriptions);
  const allProgress = await db.select().from(progress);
  const allCerts = await db.select().from(certificates);

  console.log(`\n── users (${allUsers.length}) ──`);
  for (const u of allUsers) {
    const myEnrolls = allEnrolls.filter((e) => e.userId === u.id);
    const mySubs = allSubs.filter((s) => s.userId === u.id);
    const myProgress = allProgress.filter((p) => p.userId === u.id);
    const myCerts = allCerts.filter((c) => c.userId === u.id);
    const doneCount = myProgress.filter((p) => p.completedAt).length;

    console.log(
      `\n${u.email}  (clerk=${u.clerkId})  status=${u.status}`,
    );
    console.log(
      `  enrollments: ${myEnrolls.length ? myEnrolls.map((e) => `${e.courseSlug}[${e.status}]`).join(', ') : '—'}`,
    );
    console.log(
      `  subscriptions: ${mySubs.length ? mySubs.map((s) => `${s.status} (period_end=${s.currentPeriodEnd?.toISOString() ?? '—'})`).join(', ') : '—'}`,
    );
    console.log(`  progress rows: ${myProgress.length} (completed: ${doneCount})`);
    console.log(
      `  certificates: ${myCerts.length ? myCerts.map((c) => `${c.courseSlug}:${c.verificationCode}`).join(', ') : '—'}`,
    );
  }

  console.log(`\n── totals ──`);
  console.log(`users=${allUsers.length} enrollments=${allEnrolls.length} subscriptions=${allSubs.length} progress=${allProgress.length} certificates=${allCerts.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✗ Échec :', e instanceof Error ? e.message : e);
    process.exit(1);
  });
