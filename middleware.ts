import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
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

// When Clerk keys are present, run Clerk first (auth + protection) then hand off
// to next-intl. Without keys, fall back to next-intl only so the site still runs.
export default clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
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
  : intlMiddleware;

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
