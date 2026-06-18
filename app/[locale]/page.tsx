import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { ManifestList } from '@/components/courses/ManifestList';
import { courses } from '@/data/courses';
import { Hero } from '@/components/home/Hero';
import { Blockers } from '@/components/home/Blockers';
import { Founder } from '@/components/home/Founder';
import { Testimonials } from '@/components/home/Testimonials';
import { SeatsBanner } from '@/components/home/SeatsBanner';
import { Pricing } from '@/components/home/Pricing';
import { Faq } from '@/components/home/Faq';
import { FinalCta } from '@/components/home/FinalCta';

export default async function Home({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const tm = await getTranslations('home.manifest');
  const tc = await getTranslations('common');

  return (
    <>
      <Hero />
      <Blockers />

      <Section id="fomasyon">
        <Container>
          <Eyebrow>{tm('eyebrow')}</Eyebrow>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
            {tm('title')}
          </h2>
          <p className="mt-3 max-w-xl text-graphite">{tm('subtitle')}</p>
          <div className="mt-10">
            <ManifestList courses={courses} />
          </div>
          <div className="mt-8 text-center">
            <Link href="/formations" className={buttonClasses('ghost', 'md')}>
              {tc('seeAll')}
            </Link>
          </div>
        </Container>
      </Section>

      <Founder />
      <Testimonials />
      <SeatsBanner />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
