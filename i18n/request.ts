import { getRequestConfig } from 'next-intl/server';
import { routing, type Locale } from './routing';
import { applyTextOverrides } from '@/lib/admin/site/ops';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }

  // Admin text edits (CMS) override the JSON; JSON stays the fallback. The
  // overrides reflect live on dynamic pages; static pages pick them up at
  // build/with the DB (owner Option-B note still applies to static surfaces).
  const base = (await import(`../messages/${locale}.json`)).default;
  return {
    locale,
    messages: applyTextOverrides(base as Record<string, unknown>, locale as 'ht' | 'fr') as typeof base,
  };
});
