import { getTranslations } from 'next-intl/server';
import { SmartImage } from '@/components/ui/SmartImage';
import { Link } from '@/i18n/routing';
import { Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { buttonClasses } from '@/components/ui/Button';
import { siteImageSrc } from '@/lib/courseImage';

export async function Hero() {
  const t = await getTranslations('home.hero');
  const stats = [t('stats.courses'), t('stats.languages'), t('stats.online')];

  return (
    <section className="relative overflow-hidden">
      <Container className="py-16 md:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Sceau size="lg" print rotate={-6} className="mb-8">
            <span className="font-display text-[2.75rem] font-black leading-none md:text-5xl">
              9
            </span>
            <span className="mt-1 text-[10px] tracking-[0.2em]">
              {t('sealLabel')}
            </span>
          </Sceau>

          <h1 className="font-display text-[2.75rem] font-black leading-[0.95] text-ink md:text-7xl">
            {t('title')}
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-graphite md:text-lg">
            {t('subtitle')}
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link href="/checkout" className={buttonClasses('primary', 'lg')}>
              {t('ctaPrimary')}
            </Link>
            <Link href="/formations" className={buttonClasses('ghost', 'lg')}>
              {t('ctaSecondary')}
            </Link>
          </div>

          <ul className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            {stats.map((s) => (
              <li
                key={s}
                className="rounded-full border border-ink/15 bg-paper/60 px-3.5 py-1.5 font-mono text-xs text-ink/80"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* showcase image */}
        <div className="relative mt-14 aspect-[16/9] overflow-hidden rounded-2xl border border-ink/12 bg-ink sm:aspect-[21/9]">
          <SmartImage
            src={siteImageSrc('hero')}
            alt="Moun Ayisyen k ap sèvi ak zouti dijital pou fè biznis — PNICE Academy"
            fill
            priority
            sizes="(max-width: 1120px) 100vw, 1120px"
            className="object-cover"
          />
        </div>
      </Container>
    </section>
  );
}
