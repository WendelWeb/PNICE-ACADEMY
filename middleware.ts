import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { routing } from './i18n/routing';
import { clerkEnabled } from './lib/clerk';
import { isAdminRole } from './lib/admin/roles';

const intlMiddleware = createIntlMiddleware(routing);

// Routes that require a signed-in user (locale-prefixed).
const isProtectedRoute = createRouteMatcher([
  '/(ht|fr)/tableau-de-bord(.*)',
  '/(ht|fr)/kont(.*)',
  '/(ht|fr)/checkout(.*)',
]);

// Admin area — requires sign-in AND an admin role.
const isAdminRoute = createRouteMatcher(['/(ht|fr)/admin(.*)']);

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
        await auth.protect();
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
