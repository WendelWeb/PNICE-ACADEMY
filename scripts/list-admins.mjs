/**
 * Diagnostic: list Clerk users with their admin role + 2FA status, so we can see
 * who is/can be an admin. Reads CLERK_SECRET_KEY from .env.local (never printed).
 *
 *   node scripts/list-admins.mjs
 */
import { config } from 'dotenv';
import { createClerkClient } from '@clerk/backend';

config({ path: '.env.local' });

const hasPublishable = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const hasSecret = !!process.env.CLERK_SECRET_KEY;
console.log('Clerk publishable key set:', hasPublishable);
console.log('Clerk secret key set    :', hasSecret);
console.log('ADMIN_BOOTSTRAP_EMAILS  :', process.env.ADMIN_BOOTSTRAP_EMAILS || '(not set)');

if (!hasSecret) {
  console.error('\n✗ No CLERK_SECRET_KEY — cannot reach Clerk. Auth runs in MOCK mode; real admin access is impossible until Clerk keys are in .env.local.');
  process.exit(2);
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const res = await clerk.users.getUserList({ limit: 25 });
const list = Array.isArray(res) ? res : res.data;

console.log(`\nClerk users (${list.length}):`);
for (const u of list) {
  const primary =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) || u.emailAddresses[0];
  console.log(
    ` - ${u.id} | ${primary?.emailAddress ?? '(no email)'} | role: ${JSON.stringify(
      u.publicMetadata?.role ?? null,
    )} | 2FA: ${u.twoFactorEnabled}`,
  );
}
