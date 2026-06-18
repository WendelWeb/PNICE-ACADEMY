import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconArrowLeft, IconCheck } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { buttonClasses } from '@/components/ui/Button';
import { CourseIcon } from '@/components/courses/CourseIcon';
import { courses, getCourse } from '@/data/courses';
import { subscription } from '@/data/pricing';
import {
  courseTitle,
  courseTagline,
  courseLearn,
  courseAudience,
  lessonTitle,
} from '@/lib/courseFields';
import { formatUsd, htgLabel } from '@/lib/money';

export function generateStaticParams() {
  return courses.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params: { slug, locale },
}: {
  params: { slug: string; locale: string };
}): Promise<Metadata> {
  const c = getCourse(slug);
  if (!c) return {};
  return {
    title: `${locale === 'ht' ? c.title_ht : c.title_fr} — PNICE Academy`,
  };
}

export default async function CourseDetail({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(locale);
  const course = getCourse(slug);
  if (!course) notFound();

  const t = await getTranslations('course');
  const tc = await getTranslations('common');
  const learn = courseLearn(course, locale);

  return (
    <Section>
      <Container>
        <Link
          href="/formations"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/60 transition-colors hover:text-ochre"
        >
          <IconArrowLeft size={15} />
          {t('back')}
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          {/* Left — content */}
          <div>
            <div className="flex items-center gap-2">
              <CourseIcon name={course.icon} size={18} className="text-teal" />
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink/45">
                {course.code}
              </span>
            </div>
            <h1 className="mt-3 font-display text-4xl font-black leading-[0.98] text-ink md:text-5xl">
              {courseTitle(course, locale)}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-graphite">
              {courseTagline(course, locale)}
            </p>

            {/* Learn */}
            <h2 className="mt-12 font-display text-2xl font-bold text-ink">
              {t('learnTitle')}
            </h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {learn.map((point, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-lg border border-ink/10 bg-paper-light p-4"
                >
                  <IconCheck size={20} className="mt-0.5 shrink-0 text-ochre" />
                  <span className="text-[15px] text-graphite">{point}</span>
                </li>
              ))}
            </ul>

            {/* Audience */}
            <h2 className="mt-12 font-display text-2xl font-bold text-ink">
              {t('audienceTitle')}
            </h2>
            <p className="mt-3 max-w-xl text-graphite">
              {courseAudience(course, locale)}
            </p>

            {/* Lessons */}
            <h2 className="mt-12 font-display text-2xl font-bold text-ink">
              {t('lessonsTitle')}
            </h2>
            <ol className="mt-5 border-y border-ink/10">
              {course.lessons.map((l, i) => (
                <li
                  key={i}
                  className="flex items-center gap-4 border-b border-ink/10 py-4 last:border-b-0"
                >
                  <span className="font-mono text-sm font-semibold text-ochre tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[15px] text-graphite">
                    {lessonTitle(l, locale)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Right — purchase card */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-ink/15 bg-paper-light p-7">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-5xl font-black leading-none text-ink">
                      {formatUsd(course.priceUsd)}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-sm text-graphite/60">
                    ~{htgLabel(course.priceUsd)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-teal">
                    {t('lifetime')}
                  </p>
                </div>
                <Sceau size="sm" tone="ochre" rotate={-6}>
                  <span className="font-display text-sm font-black leading-none">
                    {course.code}
                  </span>
                </Sceau>
              </div>

              <Link
                href={`/checkout?course=${course.slug}`}
                className={buttonClasses('primary', 'lg', 'mt-6 w-full')}
              >
                {tc('buy')}
              </Link>

              <div className="my-4 flex items-center gap-3 text-xs text-ink/40">
                <span className="h-px flex-1 bg-ink/10" />
                <span className="font-mono uppercase">{tc('or')}</span>
                <span className="h-px flex-1 bg-ink/10" />
              </div>

              <Link
                href="/checkout?plan=sub"
                className={buttonClasses('ghost', 'lg', 'w-full')}
              >
                {tc('subscribe')}
              </Link>
              <p className="mt-3 text-center font-mono text-[11px] text-graphite/55">
                {t('includedNote', {
                  price: formatUsd(subscription.usd),
                  per: tc('perMonth'),
                })}
              </p>

              <p className="mt-5 font-mono text-[11px] text-graphite/45">
                {t('lessonsCount', { count: course.lessons.length })}
              </p>
            </div>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
