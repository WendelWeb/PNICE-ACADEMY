/**
 * Server-side page guards. The layout proves you're an admin; these check a
 * specific capability so a lower role can't reach a section by typing its URL.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from './access';
import { can, type Capability } from './permissions';
import type { AdminRole } from './roles';

export async function currentAdminRole(): Promise<AdminRole | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return resolveAdminRole(user);
}

export async function hasCap(cap: Capability): Promise<boolean> {
  const role = await currentAdminRole();
  return !!role && can(role, cap);
}
