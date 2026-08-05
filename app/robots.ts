import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/email/layout';

/**
 * robots.txt (Stage 8 — launch hygiene). Disallows exactly the surfaces that
 * are never meant to be indexed: the API itself, the signed-in account area
 * (`/kont`), admin, the learner dashboard, and checkout. Applied per-locale
 * since every real route is locale-prefixed (`localePrefix: 'always'` — see
 * i18n/routing.ts). robots.txt's `Disallow` is a prefix match, so one entry
 * per section covers every sub-path (`/ht/checkout` also blocks
 * `/ht/checkout/merci`, `?session_id=…`, etc).
 */
export default function robots(): MetadataRoute.Robots {
  const sections = ['kont', 'admin', 'tableau-de-bord', 'checkout'];
  const disallow = ['ht', 'fr'].flatMap((locale) =>
    sections.map((section) => `/${locale}/${section}`),
  );

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api', ...disallow],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
