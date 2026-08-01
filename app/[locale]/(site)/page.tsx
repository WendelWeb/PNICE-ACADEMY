import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { CourseCardGrid } from '@/components/courses/CourseCardGrid';
import { getPublishedCourses } from '@/lib/courses/source';
import { Hero } from '@/components/home/Hero';
import { MarketplaceBar } from '@/components/home/MarketplaceBar';
import { Blockers } from '@/components/home/Blockers';
import { TeacherSpotlight } from '@/components/home/TeacherSpotlight';
import { HowMarketplace } from '@/components/home/HowMarketplace';
import { TeachTeaser } from '@/components/home/TeachTeaser';
import { Founder } from '@/components/home/Founder';
import { Testimonials } from '@/components/home/Testimonials';
// `Pricing` (the old global "$79 unlocks the whole catalog" table) was
// replaced by TeacherSpotlight ($79 as PNICE Academy's own pass) +
// HowMarketplace (teacher-agnostic mechanics) per the marketplace pivot
// (docs/superpowers/plans/2026-07-23-marketplace-homepage.md, M1). The
// component was removed in M2 (dead since M1, confirmed unimported).
import { Faq } from '@/components/home/Faq';
import { FinalCta } from '@/components/home/FinalCta';

// Dynamic so admin edits (testimonials, site texts) reflect live on the home
// page (Phase C Lot 2). Other public pages stay static (Option B).
export const dynamic = 'force-dynamic';

export default async function Home({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const tm = await getTranslations('home.manifest');
  const tc = await getTranslations('common');
  const courses = await getPublishedCourses();

  return (
    <>
      <Hero />
      <MarketplaceBar courses={courses} />
      <Blockers />

      <Section id="fomasyon">
        <Container>
          <Eyebrow>{tm('eyebrow')}</Eyebrow>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
            {tm('title', { count: courses.length })}
          </h2>
          <p className="mt-3 max-w-xl text-graphite">{tm('subtitle')}</p>
          <div className="mt-10">
            <CourseCardGrid courses={courses} />
          </div>
          <div className="mt-8 text-center">
            <Link href="/formations" className={buttonClasses('ghost', 'md')}>
              {tc('seeAll')}
            </Link>
          </div>
        </Container>
      </Section>

      <TeacherSpotlight />
      <HowMarketplace />
      <TeachTeaser />
      <Founder />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
