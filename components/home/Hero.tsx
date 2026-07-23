import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Container, Eyebrow } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { ManifestCard } from '@/components/home/ManifestCard';
import { RouteLine } from '@/components/layout/RouteLine';
import { courses } from '@/data/courses';
import { courseTitle } from '@/lib/courseFields';

/** Catalog entries shown on the manifest; the rest go in the « +N » footer row. */
const MANIFEST_ROWS = 5;

/**
 * Hero « manifeste vivant » (PART A3) — two columns: the platform thesis on
 * the left, the stamped cargo-manifest document (real catalog data) on the
 * right, with the teal route thread starting under it. Below: the trust
 * strip — four mono stats. The old hero slideshow moved to the story section.
 */
export async function Hero() {
  const [t, locale] = await Promise.all([
    getTranslations('home.hero'),
    getLocale(),
  ]);

  const rows = courses.slice(0, MANIFEST_ROWS).map((c) => ({
    code: c.code,
    title: courseTitle(c, locale),
    priceUsd: c.priceUsd,
  }));
  const moreCount = courses.length - rows.length;

  const trust = [
    t('trust.courses', { count: courses.length }),
    t('trust.languages'),
    t('trust.certificate'),
    t('trust.moncash'),
  ];

  return (
    <section className="relative overflow-x-clip">
      <Container className="pt-14 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* the thesis */}
          <div>
            <Eyebrow>{t('eyebrow')}</Eyebrow>
            <h1 className="mt-4 font-display text-[2.75rem] font-black leading-[0.92] text-ink md:text-6xl xl:text-7xl">
              {t('title')}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-graphite md:text-lg">
              {t('subtitle')}
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <AuthCta href="/checkout" className={buttonClasses('primary', 'lg')}>
                {t('ctaPrimary')}
              </AuthCta>
              <Link href="/formations" className={buttonClasses('ghost', 'lg')}>
                {t('ctaSecondary')}
              </Link>
            </div>
          </div>

          {/* the living manifest */}
          <div className="w-full lg:max-w-[30rem] lg:justify-self-end">
            <ManifestCard
              rows={rows}
              labels={{
                docTitle: t('manifest.docTitle'),
                docNo: t('manifest.docNo'),
                colCode: t('manifest.colCode'),
                colItem: t('manifest.colItem'),
                colPrice: t('manifest.colPrice'),
                more: t('manifest.more', { count: moreCount }),
                sealBottom: t('manifest.sealBottom'),
              }}
            />
            {/* the route starts under the manifest */}
            <RouteLine tone="teal" align="center" />
          </div>
        </div>
      </Container>

      {/* trust strip — document data, not decoration */}
      <div className="border-y border-ink/10 bg-paper/40">
        <Container>
          <ul className="grid grid-cols-2 py-2 md:grid-cols-4 md:divide-x md:divide-ink/10 md:py-0">
            {trust.map((item) => (
              <li
                key={item}
                className="px-2 py-2 text-center font-mono text-xs tracking-[0.04em] text-ink/75 md:py-4"
              >
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </div>
    </section>
  );
}
