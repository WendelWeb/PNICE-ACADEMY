import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClerkProvider } from '@clerk/nextjs';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing, type Locale } from '@/i18n/routing';
import { clerkEnabled } from '@/lib/clerk';
import { clerkAppearance, clerkLocalization } from '@/lib/clerkTheme';
import { PreferenceApplier } from '@/components/PreferenceApplier';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'PNICE Academy — Bati lavi dijital ou, san limit',
  description:
    'Kat vityèl, kòmès sou entènèt, biznis shipping, IA pou kreye sit ak app — tout sa ou bezwen pou fè lajan an dola.',
};

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
    <html lang={locale} className="font-body">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@400;700;800;900&family=Work+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
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
      </body>
    </html>
  );
}
