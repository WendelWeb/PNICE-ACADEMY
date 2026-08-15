import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { CourseCatalogCard } from '@/components/courses/CourseCatalogCard';
import { getCourseRatings } from '@/lib/reviews/reviews';
import { getCourseTeacherChips } from '@/lib/home/source';
import { courseMainImage } from '@/lib/courseImage';
import type { Course } from '@/data/courses';

/** Featured slice — the full catalogue lives one click away on /formations. */
const FEATURED_COUNT = 6;

/**
 * The featured courses (Stage: the living manifest, section 4) — the SAME
 * card /formations uses (one design system, no home-only variant), plus two
 * truthful extras resolved here in batch: real star ratings (published
 * reviews only — a course with none claims none) and DB-first teacher
 * attribution, so a 2nd+ real teacher's course credits its actual author.
 * `id="fomasyon"` is the anchor the old home section already answered to.
 */
export async function FeaturedCourses({ courses }: { courses: Course[] }) {
  const [t, tc] = await Promise.all([
    getTranslations('home.manifest'),
    getTranslations('common'),
  ]);

  const featured = courses.slice(0, FEATURED_COUNT);
  const slugs = featured.map((c) => c.slug);
  const [ratings, chips] = await Promise.all([
    getCourseRatings(slugs),
    getCourseTeacherChips(slugs),
  ]);

  return (
    <Section id="fomasyon" className="bg-paper">
      <Container>
        <Reveal>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
            {t('title', { count: courses.length })}
          </h2>
          <p className="mt-3 max-w-xl text-graphite">{t('subtitle')}</p>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((course, i) => (
            <Reveal key={course.code} delay={(i % 3) * 70} className="h-full">
              <CourseCatalogCard
                course={course}
                rating={ratings[course.slug] ?? null}
                teacher={chips[course.slug] ?? null}
                imageSrc={courseMainImage(course.images, course.code)}
              />
            </Reveal>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/formations" className={buttonClasses('ghost', 'md')}>
            {tc('seeAll')}
          </Link>
        </div>
      </Container>
    </Section>
  );
}
