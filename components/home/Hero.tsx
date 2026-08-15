import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Container, Eyebrow } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';
import { HeroShowcase } from '@/components/home/HeroShowcase';
import { HeroSearch } from '@/components/home/HeroSearch';
import { activeProviderLabels } from '@/lib/payments/providers';
import type { Course } from '@/data/courses';

/**
 * The hero — the marketplace's thesis in huge kreyòl display type on the
 * left; on the right, a stack of REAL course cards signed by their own
 * teachers (HeroShowcase). It used to be a stamped cargo-manifest document —
 * replaced on the owner's decision (août 2026): the site must read as a
 * marketplace where anyone sells, and a sealed manifest read as one
 * person's app.
 *
 * Every path out of here is honest: the primary CTA browses the catalogue
 * (/formations — never a bare pay screen), the secondary recruits teachers
 * (/enseigner), and the inline search lands on /formations?q=. The trust
 * strip below states only TRUE claims — the payment entry derives from
 * `activeProviders()` (the ONE payment-truth source) and disappears entirely
 * if no rail is live.
 */
export async function Hero({ courses }: { courses: Course[] }) {
  const [t, payments] = await Promise.all([
    getTranslations('home.hero'),
    activeProviderLabels(),
  ]);

  const trust = [
    // Only claim payment when a rail is actually live — brand labels straight
    // from the payment-truth source, never a hardcoded list.
    ...(payments.length > 0 ? [t('trust.secure', { providers: payments.join(' · ') })] : []),
    t('trust.certificate'),
    t('trust.languages'),
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
              <Link href="/formations" className={buttonClasses('primary', 'lg')}>
                {t('ctaPrimary')}
              </Link>
              <Link href="/enseigner" className={buttonClasses('ghost', 'lg')}>
                {t('ctaSecondary')}
              </Link>
            </div>
            <div className="mt-6">
              <HeroSearch />
            </div>
          </div>

          {/* the marketplace, live — the page's one signature moment */}
          <HeroShowcase courses={courses} />
        </div>
      </Container>

      {/* trust strip — document data, only TRUE claims */}
      <div className="border-y border-ink/10 bg-paper/40">
        <Container>
          <ul className="flex flex-wrap items-center justify-center gap-x-2 py-1 md:py-0">
            {trust.map((item, i) => (
              <li
                key={item}
                className="flex items-center gap-2 px-1 py-2 font-mono text-xs tracking-[0.04em] text-ink/75 md:py-4"
              >
                {i > 0 && (
                  <span aria-hidden="true" className="text-ink/25">
                    ·
                  </span>
                )}
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </div>
    </section>
  );
}
