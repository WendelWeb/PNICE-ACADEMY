/**
 * One-time backfill: sync every existing Clerk user into the `users` table.
 * After this, the Clerk webhook (`/api/webhooks/clerk`) keeps them in sync.
 *
 * Run: npm run db:sync-clerk   (needs DATABASE_URL + CLERK_SECRET_KEY in .env.local)
 *
 * dotenv is loaded FIRST, and `db` is imported dynamically AFTER, because the
 * Neon client captures DATABASE_URL at import time.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant dans .env.local');
  if (!process.env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY manquant dans .env.local');

  const { db, schema } = await import('../db/index');
  const { createClerkClient } = await import('@clerk/backend');
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  const limit = 100;
  let offset = 0;
  let total = 0;
  for (;;) {
    const res = await clerk.users.getUserList({ limit, offset });
    const list = res.data;
    if (!list.length) break;
    for (const u of list) {
      const email =
        u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
        u.emailAddresses[0]?.emailAddress ??
        '';
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || email || u.id;
      const phone = u.phoneNumbers?.[0]?.phoneNumber ?? null;
      await db
        .insert(schema.users)
        .values({
          clerkId: u.id,
          email,
          name,
          certificateName: name,
          phone,
          status: u.banned ? 'banned' : 'active',
          createdAt: u.createdAt ? new Date(u.createdAt) : undefined,
        })
        .onConflictDoUpdate({ target: schema.users.clerkId, set: { email, name, certificateName: name, phone } });
      total++;
    }
    offset += list.length;
    if (list.length < limit) break;
  }
  console.log(`✓ Sync terminé : ${total} utilisateur(s) Clerk → table users.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('✗ Sync échoué :', e instanceof Error ? e.message : e);
  process.exit(1);
});
