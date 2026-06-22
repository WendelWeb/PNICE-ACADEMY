/**
 * Admin roles for PNICE Academy.
 *
 * The role lives in Clerk `publicMetadata.role` — set SERVER-SIDE only (Backend
 * API / Dashboard), never `unsafeMetadata`, because it is a security boundary,
 * not a user-editable preference. See docs/admin-setup.md to grant a role.
 *
 * Keep this file dependency-free (no React / Next): it is imported by the Edge
 * middleware as well as server components.
 */

export const ADMIN_ROLES = [
  'super-admin',
  'admin',
  'support',
  'editeur-contenu',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Narrowing guard — true only for a real admin role string. */
export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Read the role from a Clerk publicMetadata object (server or client shape). */
export function roleFromMetadata(
  metadata: { role?: unknown } | null | undefined,
): AdminRole | null {
  const role = metadata?.role;
  return isAdminRole(role) ? role : null;
}

/**
 * Functional tone for a role badge (maps onto the design tokens). Ochre =
 * elevated/admin, teal = operational, graphite = neutral.
 */
export function roleTone(role: AdminRole): 'ochre' | 'teal' | 'graphite' {
  switch (role) {
    case 'super-admin':
    case 'admin':
      return 'ochre';
    case 'support':
      return 'teal';
    case 'editeur-contenu':
      return 'graphite';
  }
}
