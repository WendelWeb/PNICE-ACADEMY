import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevronRight,
  IconShieldCheck,
  IconQuote,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { Sceau } from '@/components/ui/Sceau';
import { SmartImage } from '@/components/ui/SmartImage';
import { buttonClasses } from '@/components/ui/Button';
import { CourseFaqList } from '@/components/courses/CourseFaqList';
import { CourseSlideshow } from '@/components/courses/CourseSlideshow';
import { ManifestList, type ManifestRow } from '@/components/courses/ManifestList';
import { MobileBuyBar } from '@/components/courses/MobileBuyBar';
import { AuthCta } from '@/components/auth/AuthCta';
import { categoryTone } from '@/lib/courseCategory';
import {
  getPublishedCourses,
  getPublishedCourseBySlug,
  getCourseDetail,
} from '@/lib/courses/source';
import { getCourseTeacher, teacherShortBio } from '@/data/teachers';
import { getCourseTestimonial } from '@/lib/admin/site/ops';
import { courseImages, siteImageSrc } from '@/lib/courseImage';
import { subscription } from '@/data/pricing';
import {
  courseTitle,
  courseTagline,
  courseLearn,
  courseAudience,
  lessonTitle,
  formatDuration,
} from '@/lib/courseFields';
import { formatUsd } from '@/lib/money';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { cn } from '@/lib/cn';

// Only PUBLISHED courses get a pre-rendered sales page — an unpublished/draft
// course must 404 for public visitors (see the page body below).
export async function generateStaticParams() {
  const courses = await getPublishedCourses();
  return courses.map((c) => ({ slug: c.slug }));
}

// Course + sales-page content is DB-backed (Task C2-T3, gated + fallback to
// static data) — revalidate periodically instead of staying purely static.
export const revalidate = 300;

export async function generateMetadata({
  params: { slug, locale },
}: {
  params: { slug: string; locale: string };
}): Promise<Metadata> {
  const c = await getPublishedCourseBySlug(slug);
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
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();
  const detail = await getCourseDetail(slug);
  if (!detail) notFound();

  const t = await getTranslations('course');
  const tc = await getTranslations('common');
  const tCatalog = await getTranslations('catalog');

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

  const lessonRows: ManifestRow[] = course.lessons.map((l, i) => {
    const ld = detail.lessonDetails[i];
    return {
      title: lessonTitle(l, locale),
      desc: ld ? (locale === 'ht' ? ld.desc_ht : ld.desc_fr) : undefined,
      duration: ld ? `${ld.minutes} ${t('minShort')}` : undefined,
    };
  });

  const teacher = getCourseTeacher(course.slug);
  const testimonial = getCourseTestimonial(course.slug);
  const testimonialQuote = testimonial
    ? locale === 'ht'
      ? testimonial.quote_ht
      : testimonial.quote_fr
    : null;

  return (
    <div className="pb-24 lg:pb-0">
      <Section>
        <Container>
          <Link
            href="/formations"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/60 transition-colors hover:text-ochre"
          >
            <IconArrowLeft size={15} />
            {t('back')}
          </Link>

          {/* cover */}
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl border border-ink/12 bg-paper">
            <CourseSlideshow
              images={courseImages(course.code)}
              alt={`${courseTitle(course, locale)} — PNICE Academy`}
              sizes="(max-width: 1120px) 100vw, 1120px"
              priority
            />
          </div>

          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
            {/* ---------- Content ---------- */}
            <div className="min-w-0">
              {/* ---------- Hero ---------- */}
              <div className="flex items-start gap-4">
                <Sceau size="md" tone="ochre" rotate={-6} className="shrink-0">
                  <span className="font-display text-2xl font-black leading-none">
                    {course.code}
                  </span>
                </Sceau>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide',
                        categoryTone[course.category],
                      )}
                    >
                      {tCatalog(`categories.${course.category}`)}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
                      {t('levelLabel')}: {level} · {t('durationLabel')}: {duration}
                    </span>
                  </div>
                  <h1 className="mt-3 font-display text-4xl font-black leading-[0.98] text-ink md:text-5xl">
                    {courseTitle(course, locale)}
                  </h1>
                  <p className="mt-3 max-w-xl text-lg leading-relaxed text-graphite">
                    {courseTagline(course, locale)}
                  </p>
                  {teacher && (
                    <Link
                      href={`/prof/${teacher.slug}`}
                      className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-ink/60 transition-colors hover:text-ochre"
                    >
                      {tCatalog('teacherLine', { name: teacher.displayName })}
                    </Link>
                  )}
                </div>
              </div>

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

              {/* quick facts — document data strip */}
              <ul className="mt-8 grid grid-cols-2 border-y border-ink/10 font-mono text-xs tracking-[0.04em] text-ink/75 sm:grid-cols-4 sm:divide-x sm:divide-ink/10">
                <li className="px-2 py-3 text-center md:py-4">
                  {t('lessonsCount', { count: course.lessons.length })}
                </li>
                <li className="px-2 py-3 text-center md:py-4">
                  {t('facts.languages')}
                </li>
                <li className="px-2 py-3 text-center md:py-4">
                  {t('facts.certificate')}
                </li>
                <li className="px-2 py-3 text-center md:py-4">{t('lifetime')}</li>
              </ul>

              {/* audience + requirements */}
              <Reveal className="mt-12">
                <h2 className="font-display text-2xl font-bold text-ink">
                  {t('audienceTitle')}
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-graphite">
                  {courseAudience(course, locale)}
                </p>
                <h3 className="mt-6 font-display text-base font-bold text-ink">
                  {t('requirementsTitle')}
                </h3>
                <ul className="mt-3 space-y-2">
                  {requirements.map((r, i) => (
                    <li
                      key={i}
                      className="flex gap-2.5 text-[15px] text-graphite"
                    >
                      <IconChevronRight
                        size={17}
                        className="mt-0.5 shrink-0 text-teal"
                      />
                      {r}
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* learn checklist + deliverables */}
              <Reveal className="mt-12">
                <h2 className="font-display text-2xl font-bold text-ink">
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

                <h3 className="mt-8 font-display text-base font-bold text-ink">
                  {t('deliverablesTitle')}
                </h3>
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {deliverables.map((d, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
                        <IconCheck size={13} />
                      </span>
                      <span className="text-[15px] text-graphite">{d}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* lesson manifest */}
              <Reveal className="mt-12">
                <h2 className="font-display text-2xl font-bold text-ink">
                  {t('lessonsTitle')}
                </h2>
                <div className="mt-5">
                  <ManifestList rows={lessonRows} previewLabel={t('manifest.previewLabel')} />
                </div>
              </Reveal>

              {/* faq */}
              <Reveal className="mt-12">
                <h2 className="font-display text-2xl font-bold text-ink">
                  {t('faqTitle')}
                </h2>
                <div className="mt-5">
                  <CourseFaqList items={faqItems} />
                </div>
              </Reveal>

              {/* teacher block */}
              {teacher && (
                <Reveal className="mt-12">
                  <Eyebrow>{t('teacher.eyebrow')}</Eyebrow>
                  <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-ink/12 bg-paper-light p-6 sm:flex-row sm:items-center">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-ink/15 bg-ink sm:h-24 sm:w-24">
                      <SmartImage
                        src={siteImageSrc(teacher.imageName)}
                        alt={teacher.displayName}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl font-bold text-ink">
                        {teacher.displayName}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-graphite/85">
                        {teacherShortBio(teacher, locale)}
                      </p>
                      <Link
                        href={`/prof/${teacher.slug}`}
                        className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-teal transition-colors hover:text-ochre"
                      >
                        {t('teacher.cta')}
                        <IconArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </Reveal>
              )}

              {/* social proof — only if a real, published testimonial matches */}
              {testimonial && testimonialQuote && (
                <Reveal className="mt-12">
                  <div className="rounded-2xl border border-ink/12 bg-paper-light p-7 text-center">
                    <Eyebrow>{t('social.eyebrow')}</Eyebrow>
                    <IconQuote size={24} className="mx-auto mt-3 text-ochre" />
                    <blockquote className="mx-auto mt-4 max-w-xl font-display text-xl font-bold leading-snug text-ink">
                      {testimonialQuote}
                    </blockquote>
                    <p className="mt-4 font-mono text-xs text-ink/55">
                      {testimonial.name}
                      {testimonial.location ? ` · ${testimonial.location}` : ''}
                    </p>
                  </div>
                </Reveal>
              )}
            </div>

            {/* ---------- Purchase card (desktop) ---------- */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-ink/15 bg-paper-light p-7">
                <div className="flex items-start justify-between">
                  <div>
                    <Price
                      usd={course.priceUsd}
                      className="font-display text-5xl font-black leading-none text-ink"
                    />
                    <p className="mt-1.5 font-mono text-sm text-graphite/60">
                      <PriceSecondary usd={course.priceUsd} />
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

                <p className="mt-5 flex items-start gap-2 text-xs leading-snug text-graphite/70">
                  <IconShieldCheck size={16} className="mt-0.5 shrink-0 text-teal" />
                  {t('buyCard.guarantee')}
                </p>

                <AuthCta
                  href={`/checkout?course=${course.slug}`}
                  className={buttonClasses('primary', 'lg', 'mt-5 w-full')}
                >
                  {tc('buy')}
                </AuthCta>

                <div className="my-4 flex items-center gap-3 text-xs text-ink/40">
                  <span className="h-px flex-1 bg-ink/10" />
                  <span className="font-mono uppercase">{tc('or')}</span>
                  <span className="h-px flex-1 bg-ink/10" />
                </div>

                <AuthCta
                  href="/checkout?plan=sub"
                  className={buttonClasses('ghost', 'lg', 'w-full')}
                >
                  {t('buyCard.subscribeCta', { price: formatUsd(subscription.usd) })}
                </AuthCta>
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
            <AuthCta
              href={`/checkout?course=${course.slug}`}
              className={buttonClasses('primary', 'lg')}
            >
              {tc('buy')} · <Price usd={course.priceUsd} />
            </AuthCta>
            <AuthCta
              href="/checkout?plan=sub"
              className={buttonClasses('ghost', 'lg', '!border-paper-light/30 !text-paper-light hover:!border-paper-light/60')}
            >
              {tc('subscribe')}
            </AuthCta>
          </div>
        </Container>
      </section>

      {/* ---------- Purchase bar (mobile) ---------- */}
      <MobileBuyBar
        courseSlug={course.slug}
        priceUsd={course.priceUsd}
        ctaLabel={tc('buy')}
      />
    </div>
  );
}
