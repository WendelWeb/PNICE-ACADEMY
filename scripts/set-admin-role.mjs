/**
 * Grant (or change) an admin role on a Clerk user.
 *
 *   node scripts/set-admin-role.mjs <email> <role>
 *   node scripts/set-admin-role.mjs you@example.com super-admin
 *
 * Roles: super-admin | admin | support | editeur-contenu
 *
 * Reads CLERK_SECRET_KEY from .env.local (never printed). The role is written to
 * publicMetadata.role — a server-only security field, the same one the admin
 * middleware + layout read. To REVOKE access, pass role "none".
 */
import { config } from 'dotenv';
import { createClerkClient } from '@clerk/backend';

config({ path: '.env.local' });

const ADMIN_ROLES = ['super-admin', 'admin', 'support', 'editeur-contenu'];
const [, , email, role] = process.argv;

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

if (!email || !role) die('Usage: node scripts/set-admin-role.mjs <email> <role|none>');
if (role !== 'none' && !ADMIN_ROLES.includes(role)) {
  die(`Invalid role "${role}". Use one of: ${ADMIN_ROLES.join(', ')} (or "none" to revoke).`);
}
if (!process.env.CLERK_SECRET_KEY) die('CLERK_SECRET_KEY is missing from .env.local.');

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const res = await clerk.users.getUserList({ emailAddress: [email] });
const list = Array.isArray(res) ? res : res.data;
const user = list?.[0];
if (!user) die(`No Clerk user found with email ${email}.`);

await clerk.users.updateUserMetadata(user.id, {
  publicMetadata: { role: role === 'none' ? null : role },
});

console.log(
  role === 'none'
    ? `✓ Revoked admin role for ${email} (${user.id}).`
    : `✓ ${email} (${user.id}) is now "${role}". Enable 2FA on this account to access /admin.`,
);
