'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { usePreferences } from '@/lib/usePreferences';

/**
 * Applies the signed-in user's stored preferences to the document:
 * - interface language (redirect once per session, then persist manual toggles)
 * - reduce-motion (user-level, on top of the OS media query)
 * - text size
 * Renders nothing. Mounted inside ClerkProvider.
 */
export function PreferenceApplier() {
  const { isLoaded, user } = useUser();
  const { prefs, localePref } = usePreferences();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.reduceMotion = prefs.reduceMotion ? 'true' : 'false';
    el.dataset.textSize = prefs.textSize ?? 'normal';
  }, [prefs.reduceMotion, prefs.textSize]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    const applied = sessionStorage.getItem('pnice_locale_applied');
    if (!applied) {
      sessionStorage.setItem('pnice_locale_applied', '1');
      if (localePref && localePref !== locale) {
        router.replace(pathname, { locale: localePref });
        return;
      }
    }
    // Persist the locale the user is actually on (captures manual toggles).
    if (localePref !== locale) {
      user
        .update({ unsafeMetadata: { ...user.unsafeMetadata, localePref: locale } })
        .catch(() => {});
    }
  }, [isLoaded, user, localePref, locale, pathname, router]);

  return null;
}
