import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getPublishedCourses } from '@/lib/courses/source';
import { getHomeTeachers } from '@/lib/home/source';
import { Hero } from '@/components/home/Hero';
import { ManifestBar } from '@/components/home/ManifestBar';
import { TeachersRail } from '@/components/home/TeachersRail';
import { FeaturedCourses } from '@/components/home/FeaturedCourses';
import { PricingTriptych } from '@/components/home/PricingTriptych';
import { TeachRecruit } from '@/components/home/TeachRecruit';
import { Founder } from '@/components/home/Founder';
import { Testimonials } from '@/components/home/Testimonials';
import { Faq } from '@/components/home/Faq';
import { FinalCta } from '@/components/home/FinalCta';

// Dynamic so admin edits (testimonials, prices, provider toggles, site
// texts) reflect live on the home page (Phase C Lot 2). Other public pages
// stay static (Option B).
export const dynamic = 'force-dynamic';

// Page-level, per-locale truthful marketplace metadata (Stage: the living
// manifest — the root-layout metadata overhaul happens in a later stage).
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'home.meta' });
  return { title: t('title'), description: t('description') };
}

/**
 * The homepage as the marketplace's living manifest (Stage: the living
 * manifest, rebuilt A-Z). Every section states something REAL: the hero's
 * manifest card lists the actual catalogue, the manifest bar tallies real
 * counts, the teachers rail and featured grid are DB-backed, the pricing
 * triptych reads the same sources checkout charges from, and testimonials
 * render only when real ones exist. `courses` and the teacher roster are
 * fetched ONCE here and passed down to every section that needs them.
 */
export default async function Home({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const [courses, teachers] = await Promise.all([
    getPublishedCourses(),
    getHomeTeachers(locale),
  ]);

  return (
    <>
      <Hero courses={courses} />
      <ManifestBar />
      <TeachersRail teachers={teachers} />
      <FeaturedCourses courses={courses} />
      <PricingTriptych teachers={teachers} courses={courses} />
      <TeachRecruit />
      <Founder />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
