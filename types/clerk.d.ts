import type { AdminRole } from '@/lib/admin/roles';

/**
 * Clerk type augmentation. Makes the admin role strongly typed wherever it is
 * read — `user.publicMetadata.role` (server & client) and the custom session
 * claim `sessionClaims.metadata.role` (set up in the Clerk Dashboard, see
 * docs/admin-setup.md) used by the middleware fast-path.
 */
declare global {
  interface UserPublicMetadata {
    role?: AdminRole;
    /** Admin temporarily suspended from /admin (keeps role + Clerk account). */
    adminSuspended?: boolean;
  }

  interface CustomJwtSessionClaims {
    metadata?: {
      role?: AdminRole;
    };
  }
}

export {};
