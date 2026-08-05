import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { routing, type Locale } from '@/i18n/routing';
import { clerkEnabled } from '@/lib/clerk';
import { clerkAppearance, clerkLocalization } from '@/lib/clerkTheme';
import { PreferenceApplier } from '@/components/PreferenceApplier';
import { SITE_URL } from '@/lib/email/layout';
import { fontVariables } from '@/app/fonts';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Custom viewport (Stage 8 — launch hygiene): exporting `viewport` at all
// takes over Next's auto-injected default, so width/initialScale are
// repeated here on purpose — themeColor is the only genuinely new field.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#10204A',
};

/**
 * Root metadata (Stage 8 — launch hygiene): was a single hardcoded,
 * pre-pivot single-teacher string, identical on both locales, with no
 * `metadataBase` — every relative og:image on every page (there are several)
 * resolved against nothing, and Resend/webhook links had no honest fallback
 * to key off of either (see lib/email/layout.ts's `SITE_URL`, the ONE
 * `NEXT_PUBLIC_SITE_URL` reader every email/sitemap/robots surface now
 * shares). Truthful marketplace copy, per locale, via the `metadata`
 * message namespace — kept separate from `home.meta` (the homepage already
 * overrides this with its own `generateMetadata`, unchanged) since this is
 * what every OTHER page falls back to.
 *
 * `alternates.languages` is deliberately root-only (locale homepages), not
 * per-page: there is no generic way to recover the current pathname inside a
 * shared layout's `generateMetadata`, and getting it wrong (silently mapping
 * a deep page to the wrong-language homepage) is worse than a page-scoped
 * hreflang a future stage can add where it matters most. A page that wants
 * a MORE specific `alternates` (none do today) can still set its own — Next
 * merges per top-level metadata key, so a page-level `alternates` fully
 * replaces this default for that page only.
 */
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const title = t('title');
  const description = t('description');
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      languages: { ht: '/ht', fr: '/fr' },
    },
    openGraph: {
      title,
      description,
      siteName: 'PNICE Academy',
      type: 'website',
      locale: locale === 'fr' ? 'fr_HT' : 'ht_HT',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${fontVariables} font-body`}>
      <head>
        <noscript>
          {/* Without JS, reveal-on-scroll content must still be visible. */}
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="font-body antialiased">
        <NextIntlClientProvider messages={messages}>
          {clerkEnabled ? (
            <ClerkProvider
              appearance={clerkAppearance}
              localization={clerkLocalization(locale)}
              signInUrl={`/${locale}/sign-in`}
              signUpUrl={`/${locale}/sign-up`}
            >
              <PreferenceApplier />
              {children}
            </ClerkProvider>
          ) : (
            children
          )}
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
