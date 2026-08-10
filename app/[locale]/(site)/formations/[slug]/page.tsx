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
import { ResourceLinks } from '@/components/courses/ResourceLinks';
import { MobileBuyBar } from '@/components/courses/MobileBuyBar';
import { AuthCta } from '@/components/auth/AuthCta';
import { RatingSummary } from '@/components/reviews/RatingSummary';
import { ReviewsSection } from '@/components/reviews/ReviewsSection';
import { categoryTone } from '@/lib/courseCategory';
import {
  getPublishedCourseBySlug,
  getCourseDetail,
} from '@/lib/courses/source';
import { getCourseRating } from '@/lib/reviews/reviews';
import { getTeacher, teacherShortBio } from '@/data/teachers';
import { getCourseTeacherSlug, getPublicTeacher } from '@/lib/teacher/public';
import { bunnyEmbedUrl } from '@/lib/bunny/embed';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import { getCourseTestimonial } from '@/lib/admin/site/ops';
import { absoluteImageUrl, courseImageList, courseMainImage, siteImageSrc } from '@/lib/courseImage';
import { SITE_URL } from '@/lib/email/layout';
import { getPlatformPassPriceCents } from '@/lib/platformPrice';
import {
  courseTitle,
  courseTagline,
  courseLearn,
  courseAudience,
  lessonTitle,
  formatDuration,
  courseIsBilingual,
  coursePrimaryLocale,
} from '@/lib/courseFields';
import { formatUsd } from '@/lib/money';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { cn } from '@/lib/cn';

// Fix (launch hardening pass): this page used to combine generateStaticParams
// with `revalidate` (ISR). That pairing has a confirmed Next 14.2.35 App
// Router bug — a slug NOT in the pre-rendered list renders the correct
// branded notFound() content but the HTTP response status stays 200 (soft
// 404 — bad for SEO/crawlers and for any caller checking the status code).
// Reproduced locally against a production build before this fix; verified
// gone after it. `dynamic = 'force-dynamic'` makes this route render fresh
// per-request (same pattern already used by legal/[slug], temoignage/[token],
// certificats/verifier/[code] elsewhere in this app) so `notFound()` sends a
// real 404 status, and it has the side benefit of a brand-new course's page
// being reachable immediately — no more waiting on the old 300s revalidate
// window (still additive to `publishCourse`'s own `revalidatePath` call).
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params: { slug, locale },
}: {
  params: { slug: string; locale: string };
}): Promise<Metadata> {
  const c = await getPublishedCourseBySlug(slug);
  if (!c) notFound();
  const title = `${locale === 'ht' ? c.title_ht : c.title_fr} — PNICE Academy`;
  // Stage 3 — WhatsApp is how Haiti shares links: og/twitter image is the
  // course's resolved main photo (teacher-set DB image first, static file
  // path otherwise) as an ABSOLUTE url — WhatsApp ignores relative paths.
  const image = absoluteImageUrl(courseMainImage(c.images, c.code), SITE_URL);
  return {
    title,
    openGraph: { title, images: [image] },
    twitter: { card: 'summary_large_image', title, images: [image] },
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
  const tReviews = await getTranslations('reviews');
  // Stage 4 — the subscription upsell's scope wording is CHECKOUT's own
  // (`subTeacherOnlyNote`/`subAllCoursesNote`), so the promise made here can
  // never drift from what the pay page says — same reuse as PricingTriptych.
  const tCheckout = await getTranslations('checkout');
  // Task: two subscription products — the "Pass PNICE" ghost CTA below
  // shows the LIVE owner-set price (lib/platformPrice.ts), never the static
  // data/pricing.ts constant it used to read (that constant is now only the
  // no-DB/no-settings-row FALLBACK `getPlatformPassPriceCents` itself falls
  // back to — see that module's header).
  const platformPassUsd = (await getPlatformPassPriceCents()) / 100;
  const rating = await getCourseRating(slug);

  const learn = courseLearn(course, locale);
  const deliverables =
    locale === 'ht' ? detail.deliverables_ht : detail.deliverables_fr;
  const requirements =
    locale === 'ht' ? detail.requirements_ht : detail.requirements_fr;
  const promise = locale === 'ht' ? detail.promise_ht : detail.promise_fr;
  const problem = locale === 'ht' ? detail.problem_ht : detail.problem_fr;
  const level = locale === 'ht' ? detail.level_ht : detail.level_fr;

  // Production hardening pass — `lessonDetails[i].minutes` is authored sales
  // copy, independent of whether that lesson actually has a video yet
  // (`course.lessons[i].bunnyVideoId`). Before this, the total duration and
  // every per-lesson duration below were shown regardless — a falsifiable
  // "12 min" promise next to a lesson that's a 0-second placeholder. Only
  // count/display a lesson's duration once it actually has a video; the
  // readiness gate (lib/courses/write.ts's `assertCourseSellable`) stops
  // this from happening on any NEW publish, but this is the honest interim
  // (and permanent defense-in-depth) safety net for the sales page itself.
  const totalMin = detail.lessonDetails.reduce(
    (s, l, i) => (course.lessons[i]?.bunnyVideoId ? s + l.minutes : s),
    0,
  );
  const duration = formatDuration(totalMin, t('hourShort'), t('minShort'));

  // Honesty in the UI (Task: course-language) — a monolingual course gets a
  // badge next to the category tag AND its quick-facts row says which single
  // language it's in, instead of the always-"2 lang" claim every other
  // course makes.
  const bilingual = courseIsBilingual(course);
  const coursePrimary = coursePrimaryLocale(course);
  const languageBadgeLabel = tCatalog(`languageBadge.${coursePrimary}`);

  const faqItems = detail.faq.map((f) => ({
    q: locale === 'ht' ? f.q_ht : f.q_fr,
    a: locale === 'ht' ? f.a_ht : f.a_fr,
  }));

  const lessonRows: ManifestRow[] = course.lessons.map((l, i) => {
    const ld = detail.lessonDetails[i];
    return {
      title: lessonTitle(l, locale),
      desc: ld ? (locale === 'ht' ? ld.desc_ht : ld.desc_fr) : undefined,
      // No video yet ⇒ no duration claim (see the header note on `totalMin` above).
      duration: ld && l.bunnyVideoId ? `${ld.minutes} ${t('minShort')}` : undefined,
    };
  });

  // Task K3 — curriculum grouping (Task K1/K2's chapters, optional). A course
  // with zero chapters (every one of the 9 seeded courses, plus the no-DB
  // static fallback where `chapters`/`ungroupedLessons` are undefined) must
  // keep rendering the flat `lessonRows`/`ManifestList` above EXACTLY as
  // before — `hasChapters` gates the ONLY branch that changes that.
  const chapters = detail.chapters ?? [];
  const ungroupedLessons = detail.ungroupedLessons ?? [];
  const hasChapters = chapters.length > 0;
  const curriculumRow = (l: (typeof ungroupedLessons)[number]): ManifestRow => ({
    title: lessonTitle(l, locale),
    desc: locale === 'ht' ? l.desc_ht : l.desc_fr,
    // No video yet ⇒ no duration claim (see the header note on `totalMin` above).
    duration: l.bunnyVideoId ? `${l.minutes} ${t('minShort')}` : undefined,
    preview: l.isPreview,
    number: l.index,
    // Stage 4 — watchable previews: a flagged lesson with a video gets its
    // real Bunny embed URL so the row can offer « Gade apèsi gratis ».
    // bunnyEmbedUrl is env-gated (null without BUNNY_STREAM_LIBRARY_ID or a
    // video id) — the affordance simply hides then. ONLY `is_preview`
    // lessons ever get an embed URL here; every other lesson stays gated
    // behind the auth-only lesson routes.
    previewEmbedUrl: l.isPreview ? bunnyEmbedUrl(l.bunnyVideoId) : null,
  });
  const courseResources = detail.resources ?? [];

  // Stage 4 — REAL attribution: the owning teacher resolved DB-first
  // (courses.owner_user_id → approved teacher_profiles) with the static
  // registry as fallback, then hydrated through the exact same
  // `getPublicTeacher` read /prof/[slug] renders from — so a DB-authored
  // course finally credits its actual author (photo, rating, live name),
  // not just the static teacher #1. Unattributable ⇒ no teacher block,
  // exactly as before. Everything gated + never-throws.
  const teacherSlug = await getCourseTeacherSlug(course.slug);
  const teacher = teacherSlug ? await getPublicTeacher(teacherSlug, locale) : null;
  // Compact bio for the card-foot block: the static registry's hand-written
  // short bio when this teacher has one; a DB-only teacher's live bio
  // (clamped in the markup) otherwise.
  const staticTeacher = teacher ? getTeacher(teacher.slug) : undefined;
  const teacherBioText = staticTeacher
    ? teacherShortBio(staticTeacher, locale)
    : teacher?.bio ?? '';
  // Stage 4 — honest upsell: when THIS course's teacher sells their own
  // pass, that pass (at its REAL price — lib/teacher/public.ts's
  // getActiveTeacherPlan resolution, surfaced as `teacher.plan`) is the
  // primary subscription offer; the platform-wide Pass PNICE becomes a
  // secondary mention. `plan` is null only in the teacher-#1 no-DB fallback,
  // where the platform constant IS what checkout would charge (same
  // reasoning as /prof/[slug]).
  const teacherPassUsd = teacher?.hasPlan
    ? (teacher.plan?.priceCentsMonthly ?? SUBSCRIPTION_USD * 100) / 100
    : null;
  const testimonial = await getCourseTestimonial(course.slug);
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
              images={courseImageList(course.images, course.code)}
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
                    {!bilingual && (
                      <span className="rounded-full border border-ink/12 bg-ink/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/55">
                        {languageBadgeLabel}
                      </span>
                    )}
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
                  {rating.avg !== null && (
                    <RatingSummary
                      avg={rating.avg}
                      countLabel={tReviews('countLabel', { count: rating.count })}
                      emptyLabel=""
                      size={15}
                      className="mt-2"
                    />
                  )}
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
                {courseResources.length > 0 && (
                  <div className="mt-4">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
                      {t('resourcesTitle')}
                    </p>
                    <div className="mt-2">
                      <ResourceLinks resources={courseResources} locale={locale} />
                    </div>
                  </div>
                )}
              </div>

              {/* quick facts — document data strip */}
              <ul className="mt-8 grid grid-cols-2 border-y border-ink/10 font-mono text-xs tracking-[0.04em] text-ink/75 sm:grid-cols-4 sm:divide-x sm:divide-ink/10">
                <li className="px-2 py-3 text-center md:py-4">
                  {t('lessonsCount', { count: course.lessons.length })}
                </li>
                <li className="px-2 py-3 text-center md:py-4">
                  {bilingual ? t('facts.languages') : languageBadgeLabel}
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
                <p className="mt-2 font-mono text-xs text-graphite/60">
                  {t('lessonsCount', { count: course.lessons.length })}
                  {' · '}
                  {duration}
                  {hasChapters && (
                    <>
                      {' · '}
                      {t('manifest.chaptersCount', { count: chapters.length })}
                    </>
                  )}
                </p>
                {hasChapters ? (
                  <div className="mt-5 space-y-8">
                    {chapters.map((c, ci) => {
                      const summary = locale === 'ht' ? c.summary_ht : c.summary_fr;
                      return (
                        <div key={c.id}>
                          <h3 className="font-display text-lg font-bold text-ink">
                            {t('manifest.partLabel', {
                              n: ci + 1,
                              title: locale === 'ht' ? c.title_ht : c.title_fr,
                            })}
                          </h3>
                          {summary && (
                            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-graphite/75">
                              {summary}
                            </p>
                          )}
                          <div className="mt-3">
                            <ManifestList
                              rows={c.lessons.map(curriculumRow)}
                              previewLabel={t('manifest.previewLabel')}
                              watchLabel={t('manifest.watchPreview')}
                              closeLabel={t('manifest.closePreview')}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {ungroupedLessons.length > 0 && (
                      <ManifestList
                        rows={ungroupedLessons.map(curriculumRow)}
                        previewLabel={t('manifest.previewLabel')}
                        watchLabel={t('manifest.watchPreview')}
                        closeLabel={t('manifest.closePreview')}
                      />
                    )}
                  </div>
                ) : (
                  <div className="mt-5">
                    <ManifestList rows={lessonRows} previewLabel={t('manifest.previewLabel')} />
                  </div>
                )}
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

              {/* teacher block — the REAL owner (Stage 4 attribution) */}
              {teacher && (
                <Reveal className="mt-12">
                  <Eyebrow>{t('teacher.eyebrow')}</Eyebrow>
                  <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-ink/12 bg-paper-light p-6 sm:flex-row sm:items-center">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-ink/15 bg-ink sm:h-24 sm:w-24">
                      {teacher.photoUrl ? (
                        // A validated external photo_url (same reasoning as
                        // /prof/[slug]): plain <img>, no remote-host config.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={teacher.photoUrl}
                          alt={teacher.displayName}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <SmartImage
                          src={siteImageSrc(teacher.imageName)}
                          alt={teacher.displayName}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl font-bold text-ink">
                        {teacher.displayName}
                      </h3>
                      {teacher.rating.avg !== null && (
                        <RatingSummary
                          avg={teacher.rating.avg}
                          countLabel={tReviews('countLabel', { count: teacher.rating.count })}
                          emptyLabel=""
                          size={13}
                          className="mt-1"
                        />
                      )}
                      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-graphite/85">
                        {teacherBioText}
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

              {/* ratings + reviews */}
              <ReviewsSection courseSlug={course.slug} />

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

                {teacher && teacherPassUsd !== null ? (
                  <>
                    {/* THIS teacher's own pass first (real plan price), the
                        platform pass as a secondary mention — scope wording
                        is checkout's own, so it can't drift. */}
                    <AuthCta
                      href={`/checkout?teacher=${encodeURIComponent(teacher.slug)}`}
                      className={buttonClasses('ghost', 'lg', 'w-full')}
                    >
                      {t('buyCard.teacherPassCta', {
                        name: teacher.displayName,
                        price: formatUsd(teacherPassUsd),
                      })}
                    </AuthCta>
                    <p className="mt-2 text-xs leading-snug text-teal">
                      {tCheckout('subTeacherOnlyNote', { name: teacher.displayName })}
                    </p>
                    <p className="mt-3 text-center">
                      <AuthCta
                        href="/checkout?plan=sub"
                        className="font-mono text-[11px] text-ink/55 underline decoration-ink/25 underline-offset-2 transition-colors hover:text-ochre"
                      >
                        {t('buyCard.platformPassAlso', { price: formatUsd(platformPassUsd) })}
                      </AuthCta>
                    </p>
                  </>
                ) : (
                  <>
                    <AuthCta
                      href="/checkout?plan=sub"
                      className={buttonClasses('ghost', 'lg', 'w-full')}
                    >
                      {t('buyCard.subscribeCta', { price: formatUsd(platformPassUsd) })}
                    </AuthCta>
                    <p className="mt-2 text-xs leading-snug text-teal">
                      {tCheckout('subAllCoursesNote')}
                    </p>
                  </>
                )}
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
            {/* Stage 4 — the subscription CTA mirrors the purchase card:
                this teacher's own pass when they sell one, the platform
                pass otherwise. */}
            <AuthCta
              href={
                teacher && teacherPassUsd !== null
                  ? `/checkout?teacher=${encodeURIComponent(teacher.slug)}`
                  : '/checkout?plan=sub'
              }
              className={buttonClasses('ghost', 'lg', '!border-paper-light/30 !text-paper-light hover:!border-paper-light/60')}
            >
              {teacher && teacherPassUsd !== null
                ? t('buyCard.teacherPassCta', {
                    name: teacher.displayName,
                    price: formatUsd(teacherPassUsd),
                  })
                : tc('subscribe')}
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
