import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  IconArrowLeft,
  IconCheck,
  IconClock,
  IconChevronRight,
  IconInfinity,
  IconLanguage,
  IconCertificate,
  IconDeviceLaptop,
  IconPointFilled,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { buttonClasses } from '@/components/ui/Button';
import { CourseIcon } from '@/components/courses/CourseIcon';
import { CourseFaqList } from '@/components/courses/CourseFaqList';
import { courses, getCourse } from '@/data/courses';
import { getCourseDetail } from '@/data/courseDetails';
import { subscription } from '@/data/pricing';
import {
  courseTitle,
  courseTagline,
  courseLearn,
  courseAudience,
  lessonTitle,
  formatDuration,
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
  const detail = getCourseDetail(course.code);
  if (!detail) notFound();

  const t = await getTranslations('course');
  const tc = await getTranslations('common');

  const learn = courseLearn(course, locale);
  const deliverables =
    locale === 'ht' ? detail.deliverables_ht : detail.deliverables_fr;
  const requirements =
    locale === 'ht' ? detail.requirements_ht : detail.requirements_fr;
  const promise = locale === 'ht' ? detail.promise_ht : detail.promise_fr;
  const problem = locale === 'ht' ? detail.problem_ht : detail.problem_fr;
  const level = locale === 'ht' ? detail.level_ht : detail.level_fr;

  const totalMin = detail.lessonDetails.reduce((s, l) => s + l.minutes, 0);
  const duration = formatDuration(totalMin, t('hourShort'), t('minShort'));

  const faqItems = detail.faq.map((f) => ({
    q: locale === 'ht' ? f.q_ht : f.q_fr,
    a: locale === 'ht' ? f.a_ht : f.a_fr,
  }));

  const guarantees = [
    { Icon: IconInfinity, label: t('guarantee.lifetime') },
    { Icon: IconLanguage, label: t('guarantee.languages') },
    { Icon: IconCertificate, label: t('guarantee.certificate') },
    { Icon: IconDeviceLaptop, label: t('guarantee.devices') },
  ];

  return (
    <>
      <Section>
        <Container>
          <Link
            href="/formations"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/60 transition-colors hover:text-ochre"
          >
            <IconArrowLeft size={15} />
            {t('back')}
          </Link>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
            {/* ---------- Content ---------- */}
            <div className="min-w-0">
              {/* meta */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink/55">
                <span className="inline-flex items-center gap-1.5">
                  <CourseIcon name={course.icon} size={16} className="text-teal" />
                  <span className="uppercase tracking-[0.14em]">{course.code}</span>
                </span>
                <IconPointFilled size={6} className="text-ink/25" />
                <span>
                  {t('levelLabel')}: {level}
                </span>
                <IconPointFilled size={6} className="text-ink/25" />
                <span className="inline-flex items-center gap-1">
                  <IconClock size={13} /> {duration}
                </span>
                <IconPointFilled size={6} className="text-ink/25" />
                <span>
                  {course.lessons.length} {t('lessonsWord')}
                </span>
                <IconPointFilled size={6} className="text-ink/25" />
                <span>kreyòl · français</span>
              </div>

              <h1 className="mt-4 font-display text-4xl font-black leading-[0.98] text-ink md:text-5xl">
                {courseTitle(course, locale)}
              </h1>
              <p className="mt-3 max-w-xl text-lg leading-relaxed text-graphite">
                {courseTagline(course, locale)}
              </p>

              {/* promise */}
              <div className="mt-7 rounded-xl border-l-4 border-ochre bg-ochre/[0.08] p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ochre">
                  {t('promiseLabel')}
                </p>
                <p className="mt-2 font-display text-xl font-bold leading-snug text-ink">
                  {promise}
                </p>
              </div>

              {/* problem */}
              <div className="mt-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-stampred">
                  {t('problemLabel')}
                </p>
                <p className="mt-2 max-w-xl leading-relaxed text-graphite">
                  {problem}
                </p>
              </div>

              {/* learn */}
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

              {/* deliverables */}
              <h2 className="mt-12 font-display text-2xl font-bold text-ink">
                {t('deliverablesTitle')}
              </h2>
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {deliverables.map((d, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
                      <IconCheck size={13} />
                    </span>
                    <span className="text-[15px] text-graphite">{d}</span>
                  </li>
                ))}
              </ul>

              {/* program */}
              <h2 className="mt-12 font-display text-2xl font-bold text-ink">
                {t('programTitle')}
              </h2>
              <ol className="mt-5 border-y border-ink/10">
                {course.lessons.map((l, i) => {
                  const ld = detail.lessonDetails[i];
                  return (
                    <li
                      key={i}
                      className="flex gap-4 border-b border-ink/10 py-5 last:border-b-0"
                    >
                      <span className="font-display text-2xl font-black leading-none text-ochre tabular-nums">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="font-display text-lg font-bold text-ink">
                            {lessonTitle(l, locale)}
                          </h3>
                          {ld && (
                            <span className="shrink-0 font-mono text-xs text-graphite/55">
                              {ld.minutes} {t('minShort')}
                            </span>
                          )}
                        </div>
                        {ld && (
                          <p className="mt-1 text-sm leading-relaxed text-graphite/80">
                            {locale === 'ht' ? ld.desc_ht : ld.desc_fr}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* audience + requirements */}
              <div className="mt-12 grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-ink/10 bg-paper-light p-6">
                  <h2 className="font-display text-xl font-bold text-ink">
                    {t('audienceTitle')}
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-graphite">
                    {courseAudience(course, locale)}
                  </p>
                </div>
                <div className="rounded-xl border border-ink/10 bg-paper-light p-6">
                  <h2 className="font-display text-xl font-bold text-ink">
                    {t('requirementsTitle')}
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {requirements.map((r, i) => (
                      <li key={i} className="flex gap-2.5 text-[15px] text-graphite">
                        <IconChevronRight
                          size={17}
                          className="mt-0.5 shrink-0 text-teal"
                        />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* guarantee band */}
              <div className="mt-8 rounded-xl bg-ink p-6 text-paper-light">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper-light/55">
                  {t('guaranteeTitle')}
                </p>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {guarantees.map(({ Icon, label }, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <Icon size={20} className="shrink-0 text-ochre" />
                      <span className="text-sm text-paper-light/85">{label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* faq */}
              <h2 className="mt-12 font-display text-2xl font-bold text-ink">
                {t('faqTitle')}
              </h2>
              <div className="mt-5">
                <CourseFaqList items={faqItems} />
              </div>
            </div>

            {/* ---------- Purchase card ---------- */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-ink/15 bg-paper-light p-7">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-display text-5xl font-black leading-none text-ink">
                      {formatUsd(course.priceUsd)}
                    </span>
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

                <ul className="mt-6 space-y-2 border-t border-ink/10 pt-5">
                  {guarantees.slice(0, 3).map(({ Icon, label }, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2.5 text-xs text-graphite/70"
                    >
                      <Icon size={16} className="shrink-0 text-teal" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </Container>
      </Section>

      {/* ---------- Final CTA band ---------- */}
      <section className="bg-ink py-16 text-center text-paper-light">
        <Container>
          <h2 className="mx-auto max-w-xl font-display text-3xl font-black md:text-4xl">
            {t('ctaTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-paper-light/75">
            {t('ctaText')}
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/checkout?course=${course.slug}`}
              className={buttonClasses('primary', 'lg')}
            >
              {tc('buy')} · {formatUsd(course.priceUsd)}
            </Link>
            <Link
              href="/checkout?plan=sub"
              className={buttonClasses('ghost', 'lg', '!border-paper-light/30 !text-paper-light hover:!border-paper-light/60')}
            >
              {tc('subscribe')}
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
