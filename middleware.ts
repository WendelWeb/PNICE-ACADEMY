import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { routing } from './i18n/routing';
import { clerkEnabled } from './lib/clerk';
import { isAdminRole } from './lib/admin/roles';
import { PROTECTED_ROUTE_PATTERNS, ADMIN_ROUTE_PATTERNS } from './lib/route-protection';

const intlMiddleware = createIntlMiddleware(routing);

// Patterns live in lib/route-protection.ts so they can be unit-tested without
// booting this module (see route-protection.test.ts — it guards the /kontak
// regression these exact-plus-sub-path shapes exist to prevent).
const isProtectedRoute = createRouteMatcher([...PROTECTED_ROUTE_PATTERNS]);

// Admin area — requires sign-in AND an admin role.
const isAdminRoute = createRouteMatcher([...ADMIN_ROUTE_PATTERNS]);

function localeOf(pathname: string): string {
  const seg = pathname.split('/')[1];
  return seg === 'fr' ? 'fr' : 'ht';
}

/**
 * API routes ARE matched by this middleware (see `config.matcher`) so that
 * clerkMiddleware stamps them — in @clerk/nextjs v6, `auth()` inside a route
 * handler THROWS ("Clerk can't detect usage of clerkMiddleware()") for any
 * request the middleware didn't cover, which would break every
 * /api/upload/course-asset and /api/checkout call the moment Clerk keys are
 * set. But next-intl must NEVER rewrite or redirect an API path (there is no
 * /ht/api/…), so API requests short-circuit to `NextResponse.next()` in both
 * branches below.
 */
function isApiRequest(req: NextRequest): boolean {
  return req.nextUrl.pathname.startsWith('/api');
}

// When Clerk keys are present, run Clerk first (auth + protection) then hand off
// to next-intl. Without keys, fall back to next-intl only so the site still runs.
export default clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      // Clerk has already resolved the session and stamped the request by the
      // time this handler runs — route handlers can now call auth() safely.
      if (isApiRequest(req)) return NextResponse.next();

      if (isProtectedRoute(req) || isAdminRoute(req)) {
        // `auth.protect()` with no options answers a bare 404 to a signed-out
        // visitor — so clicking "Kont mwen" or "Tablo debò" while logged out
        // used to dead-end on an error page instead of the sign-in form. The
        // ClerkProvider's signInUrl prop only steers the React components, not
        // the middleware, so the destination has to be spelled out here too.
        // Locale-aware, and `redirect_url` brings them back to where they were
        // headed once signed in.
        const locale = localeOf(req.nextUrl.pathname);
        const signIn = new URL(`/${locale}/sign-in`, req.url);
        signIn.searchParams.set('redirect_url', req.url);
        await auth.protect({ unauthenticatedUrl: signIn.toString() });
      }

      if (isAdminRoute(req)) {
        // Fast role rejection using the custom session claim (configured in the
        // Clerk Dashboard — see docs/admin-setup.md). If the claim isn't set up
        // yet it's undefined here, so we fall through and let the admin layout
        // do the authoritative role + 2FA check via the Backend API.
        const { sessionClaims } = await auth();
        const role = sessionClaims?.metadata?.role;
        if (role !== undefined && !isAdminRole(role)) {
          return NextResponse.redirect(
            new URL(`/${localeOf(req.nextUrl.pathname)}`, req.url),
          );
        }
      }

      return intlMiddleware(req);
    })
  : (req: NextRequest) => (isApiRequest(req) ? NextResponse.next() : intlMiddleware(req));

export const config = {
  // Pattern 1: every page route (no dots, not Next internals). Pattern 2: ALL
  // API routes, dots included — required so clerkMiddleware stamps them (see
  // isApiRequest above); they still bypass next-intl inside the handler.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)', '/(api)(.*)'],
};
