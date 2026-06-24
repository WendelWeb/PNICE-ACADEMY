/**
 * Resolve an admin role for a signed-in Clerk user.
 *
 * Normally the role lives in `publicMetadata.role`. To solve the bootstrap
 * chicken-and-egg (you need to be an admin to grant admin), any email listed in
 * `ADMIN_BOOTSTRAP_EMAILS` (comma-separated, in .env.local) is treated as
 * super-admin. The admin layout persists that into publicMetadata on first
 * visit, so the bootstrap env can be removed afterwards.
 *
 * Server-only (reads process.env). Accepts a structural subset of the Clerk
 * Backend User so it stays dependency-light.
 */
import { isAdminRole, type AdminRole } from './roles';

type ClerkUserLike = {
  publicMetadata?: { role?: unknown; adminSuspended?: boolean } | null;
  primaryEmailAddressId?: string | null;
  emailAddresses?: { id: string; emailAddress: string }[];
};

/** A suspended admin keeps their role but loses /admin access. */
export function isAdminSuspended(user: ClerkUserLike): boolean {
  return user.publicMetadata?.adminSuspended === true;
}

export function bootstrapEmails(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether admins must have 2FA enabled to reach /admin.
 *
 * OFF by default (2026-06-22 — temporarily relaxed at the owner's request after
 * a lost phone). Set ADMIN_REQUIRE_2FA=true in .env.local to re-require it
 * (strongly recommended once 2FA is set up again).
 */
export function admin2faRequired(): boolean {
  return process.env.ADMIN_REQUIRE_2FA === 'true';
}

export function primaryEmail(user: ClerkUserLike): string | null {
  const list = user.emailAddresses ?? [];
  const primary = list.find((e) => e.id === user.primaryEmailAddressId) ?? list[0];
  return primary?.emailAddress?.toLowerCase() ?? null;
}

/** True when the user qualifies as admin only via the bootstrap email list. */
export function isBootstrapAdmin(user: ClerkUserLike): boolean {
  if (isAdminRole(user.publicMetadata?.role)) return false;
  const email = primaryEmail(user);
  return !!email && bootstrapEmails().includes(email);
}

/** The effective admin role, or null if the user is not an admin (or suspended). */
export function resolveAdminRole(user: ClerkUserLike): AdminRole | null {
  if (isAdminSuspended(user)) return null;
  const role = user.publicMetadata?.role;
  if (isAdminRole(role)) return role;
  if (isBootstrapAdmin(user)) return 'super-admin';
  return null;
}
