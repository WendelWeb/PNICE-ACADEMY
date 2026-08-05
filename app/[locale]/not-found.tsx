import { getTranslations } from 'next-intl/server';
import { IconCompass } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { buttonClasses } from '@/components/ui/Button';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';

/**
 * Locale-wide 404 (Stage 8 — launch hygiene). Catches every `notFound()`
 * call site under app/[locale]/ that has no MORE specific not-found.tsx of
 * its own (there is none today — this is the single shared boundary for the
 * public site, the dashboard, the studio, AND admin, since a deeper
 * not-found.tsx isn't warranted for those low-traffic 404 paths).
 *
 * No `params` here — Next's not-found.js doesn't receive route params, so
 * this can't know `locale` directly. It doesn't need to: Nav/Footer and
 * `getTranslations()` below all resolve the CURRENT locale from next-intl's
 * request-scoped config (i18n/request.ts), which next-intl's own middleware
 * already derived from the real request URL — exactly how every other
 * Server Component in this tree resolves its locale, not just page.tsx
 * files with an explicit `params.locale`.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="relative flex-1">
        <Section className="flex items-center py-20 md:py-28">
          <Container className="max-w-2xl text-center">
            <Sceau size="lg" tone="red" rotate={-6} className="mx-auto" print>
              <span className="font-display text-4xl font-black leading-none">404</span>
            </Sceau>
            <Eyebrow className="mt-8 block">{t('eyebrow')}</Eyebrow>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
              {t('title')}
            </h1>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-graphite">{t('body')}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/formations" className={buttonClasses('primary', 'lg')}>
                <IconCompass size={18} />
                {t('ctaFormations')}
              </Link>
              <Link href="/kontak" className={buttonClasses('ghost', 'lg')}>
                {t('ctaContact')}
              </Link>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
