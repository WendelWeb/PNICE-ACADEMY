/**
 * The locale-prefixed route patterns the middleware gates on, kept in their own
 * pure module so they can be unit-tested WITHOUT importing middleware.ts (which
 * calls clerkMiddleware() at module scope and needs a request context).
 *
 * THE TRAP THESE PATTERNS EXIST TO AVOID: a bare `X(.*)` wildcard matches every
 * route whose name merely *starts* with X. `/(ht|fr)/kont(.*)` silently
 * swallowed `/kontak` — the PUBLIC contact page — so the one route a signed-out
 * visitor needs to reach a human answered 404 in production. Always spell a
 * gated route as the exact path PLUS an explicit sub-path pattern.
 */

/** Requires a signed-in user. */
export const PROTECTED_ROUTE_PATTERNS = [
  '/(ht|fr)/tableau-de-bord',
  '/(ht|fr)/tableau-de-bord/(.*)',
  '/(ht|fr)/kont',
  '/(ht|fr)/kont/(.*)',
  '/(ht|fr)/checkout',
  '/(ht|fr)/checkout/(.*)',
] as const;

/** Requires a signed-in user AND an admin role. */
export const ADMIN_ROUTE_PATTERNS = ['/(ht|fr)/admin', '/(ht|fr)/admin/(.*)'] as const;

/**
 * Public paths that must NEVER be gated. Used by the regression test as the
 * canary list — add any new public route here when you create it.
 */
export const PUBLIC_CANARY_PATHS = [
  '/ht',
  '/fr',
  '/ht/kontak',
  '/fr/kontak',
  '/ht/formations',
  '/ht/pri',
  '/ht/apropos',
  '/ht/fak',
  '/ht/prof',
  '/ht/prof/pnice-academy',
  '/ht/enseigner',
  '/ht/legal/cgu',
  '/ht/certificats/verifier',
] as const;
