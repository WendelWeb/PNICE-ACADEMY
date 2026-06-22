'use client';

import type { ReactNode } from 'react';
import { useLocale } from 'next-intl';
import {
  SignedIn,
  SignedOut,
  SignUpButton,
  ClerkLoading,
  ClerkLoaded,
} from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { clerkEnabled } from '@/lib/clerk';

/**
 * A purchase / conversion CTA that requires an account.
 * - Signed in (or Clerk disabled): navigates straight to `href`.
 * - Signed out: opens the Clerk sign-up modal, then redirects to `href` once
 *   the account is created (or the user signs in instead).
 * Always renders a working link during load so the CTA never flashes empty.
 */
export function AuthCta({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const linkEl = (
    <Link href={href} className={className}>
      {children}
    </Link>
  );

  if (!clerkEnabled) return linkEl;

  const redirectUrl = `/${locale}${href}`;

  return (
    <>
      <ClerkLoading>{linkEl}</ClerkLoading>
      <ClerkLoaded>
        <SignedIn>{linkEl}</SignedIn>
        <SignedOut>
          <SignUpButton
            mode="modal"
            forceRedirectUrl={redirectUrl}
            signInForceRedirectUrl={redirectUrl}
          >
            <button type="button" className={className}>
              {children}
            </button>
          </SignUpButton>
        </SignedOut>
      </ClerkLoaded>
    </>
  );
}
