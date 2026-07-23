import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconCheck } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { Stamp } from '@/components/ui/Stamp';
import { Reveal } from '@/components/ui/Reveal';
import { SmartImage } from '@/components/ui/SmartImage';
import { buttonClasses } from '@/components/ui/Button';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { AuthCta } from '@/components/auth/AuthCta';
import { CourseCatalogCard } from '@/components/courses/CourseCatalogCard';
import {
  teachers,
  getTeacher,
  teacherCourses,
  teacherBio,
  teacherDocNo,
} from '@/data/teachers';
import {
  subscription,
  subscriptionPerks_ht,
  subscriptionPerks_fr,
} from '@/data/pricing';
import { siteImageSrc } from '@/lib/courseImage';

export function generateStaticParams() {
  return teachers.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params: { slug, locale },
}: {
  params: { slug: string; locale: string };
}): Promise<Metadata> {
  const teacher = getTeacher(slug);
  if (!teacher) return {};
  return {
    // Teacher #1 IS the platform — avoid « PNICE Academy — PNICE Academy ».
    title: teacher.displayName.includes('PNICE Academy')
      ? teacher.displayName
      : `${teacher.displayName} — PNICE Academy`,
    description: teacherBio(teacher, locale),
  };
}

/**
 * `/prof/[slug]` — the teacher's public showcase, composed as a
 * « document d'expéditeur » (marketplace spec C3.5): a printed teacher sheet
 * with a mono registry rail, the personal seal stamped onto it, an honest
 * « Nòt — » cachet until reviews exist, and the stats strip as document
 * data. Static data today (data/teachers.ts); shape-ready for the C3 DB.
 */
export default async function ProfPage({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(locale);
  const teacher = getTeacher(slug);
  if (!teacher) notFound();

  const t = await getTranslations('prof');
  const tc = await getTranslations('common');

  const courses = teacherCourses(teacher);
  const lessonCount = courses.reduce((sum, c) => sum + c.lessons.length, 0);
  const bio = teacherBio(teacher, locale);
  const perks = locale === 'ht' ? subscriptionPerks_ht : subscriptionPerks_fr;
  const photo = siteImageSrc(teacher.imageName);
  const rating = teacher.rating === null ? '—' : teacher.rating.toFixed(1);
  const students =
    teacher.studentCount === null ? '—' : String(teacher.studentCount);

  const stats = [
    t('stats.courses', { count: courses.length }),
    t('stats.lessons', { count: lessonCount }),
    t('stats.languages'),
    t('stats.students', { count: students }),
  ];

  return (
    <>
      {/* ---------- The « fich anseyan » document ---------- */}
      <Section className="pb-10 md:pb-14">
        <Container>
          <div className="overflow-hidden rounded-2xl border border-ink/15 bg-paper shadow-[0_28px_56px_-32px_rgba(16,32,74,0.35)]">
            {/* registry rail */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 pb-3 pt-5 font-mono uppercase md:px-10">
              <span className="text-[11px] font-medium tracking-[0.18em] text-ink md:text-xs">
                {t('docLabel')} · {t('docBrand')}
              </span>
              <span className="whitespace-nowrap text-[11px] tracking-[0.14em] text-ink/55 md:text-xs">
                {t('docNo', { docNo: teacherDocNo(teacher) })}
              </span>
            </div>

            {/* double rule, like a printed form */}
            <div aria-hidden="true" className="px-5 md:px-10">
              <div className="border-t-2 border-ink/80" />
              <div className="mt-[3px] border-t border-ink/25" />
            </div>

            {/* identity row: photo · name · personal seal */}
            <div className="flex flex-col gap-6 px-5 py-7 md:flex-row md:items-center md:gap-10 md:px-10 md:py-10">
              <div className="flex items-start justify-between gap-4 md:contents">
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-ink/15 bg-ink md:order-1 md:h-36 md:w-36">
                  <SmartImage
                    src={photo}
                    alt={t('photoAlt', { name: teacher.displayName })}
                    fill
                    sizes="144px"
                    className="object-cover"
                    priority
                  />
                </div>
                <div className="shrink-0 md:order-3 md:self-center">
                  <Stamp rotate={-8}>
                    <Sceau size="md" rotate={0} tone="ochre">
                      <span className="text-[8px] tracking-[0.22em]">
                        {t('sealTop')}
                      </span>
                      <span className="my-0.5 font-display text-3xl font-black leading-none">
                        {teacher.initials}
                      </span>
                      <span className="text-[8px] tracking-[0.22em]">
                        {teacher.joinedYear}
                      </span>
                    </Sceau>
                  </Stamp>
                </div>
              </div>

              <div className="min-w-0 md:order-2 md:flex-1">
                <h1 className="font-display text-4xl font-black leading-[0.95] text-ink md:text-6xl">
                  {teacher.displayName}
                </h1>
                <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-teal">
                  {t('since', { year: teacher.joinedYear })}
                </p>
                {/* the note cachet — honest « — » until reviews exist */}
                <p className="mt-5 inline-flex items-baseline gap-2.5 rounded border border-ink/15 bg-paper-light px-3.5 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/55">
                    {t('noteLabel')}
                  </span>
                  <span className="font-display text-2xl font-black leading-none text-ink">
                    {rating}
                  </span>
                  {teacher.rating === null && (
                    <span className="font-mono text-[10px] text-ink/45">
                      {t('noteEmpty')}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* stats strip — document data */}
            <ul className="grid grid-cols-2 border-t border-ink/10 font-mono text-xs tracking-[0.04em] text-ink/75 sm:grid-cols-4 sm:divide-x sm:divide-ink/10">
              {stats.map((item) => (
                <li key={item} className="px-2 py-3 text-center md:py-4">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* ---------- Bio ---------- */}
      <Section className="pt-6 md:pt-10">
        <Container>
          <Reveal className="mx-auto max-w-2xl">
            <Eyebrow>{t('bio.eyebrow')}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
              {t('bio.title')}
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-graphite md:text-base">
              {bio}
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* ---------- His manifest: the course grid ---------- */}
      <Section className="bg-paper">
        <Container>
          <Reveal>
            <Eyebrow>{t('courses.eyebrow', { count: courses.length })}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
              {t('courses.title')}
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, i) => (
              <Reveal key={course.code} delay={(i % 3) * 70} className="h-full">
                <CourseCatalogCard course={course} />
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* ---------- Subscription offer ---------- */}
      <Section>
        <Container>
          <Reveal>
            <div className="overflow-hidden rounded-2xl border-2 border-ochre bg-paper-light shadow-lg shadow-ochre/10 md:grid md:grid-cols-[1.2fr_1fr]">
              <div className="p-7 md:p-10">
                <Eyebrow>{t('sub.eyebrow')}</Eyebrow>
                <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight text-ink md:text-3xl">
                  {t('sub.title')}
                </h2>
                <p className="mt-3 max-w-md leading-relaxed text-graphite">
                  {t('sub.body', { count: courses.length })}
                </p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {perks.map((perk, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-graphite">
                      <IconCheck size={18} className="mt-0.5 shrink-0 text-teal" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-center border-t-2 border-ochre/40 bg-ochre/[0.07] p-7 md:border-l-2 md:border-t-0 md:p-10">
                <div className="flex items-baseline gap-1.5">
                  <Price
                    usd={subscription.usd}
                    className="font-display text-6xl font-black leading-none text-ink"
                  />
                  <span className="font-mono text-sm text-graphite/70">
                    {tc('perMonth')}
                  </span>
                </div>
                <p className="mt-2 font-mono text-sm text-graphite/60">
                  <PriceSecondary usd={subscription.usd} />
                  {tc('perMonth')}
                </p>
                <AuthCta
                  href="/checkout?plan=sub"
                  className={buttonClasses('primary', 'lg', 'mt-6 w-full')}
                >
                  {t('sub.cta')}
                </AuthCta>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ---------- Final CTA ---------- */}
      <section className="bg-ink py-16 text-center text-paper-light">
        <Container>
          <h2 className="mx-auto max-w-xl font-display text-3xl font-black md:text-4xl">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-paper-light/75">
            {t('cta.body')}
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AuthCta href="/checkout" className={buttonClasses('primary', 'lg')}>
              {t('cta.primary')}
            </AuthCta>
            <Link
              href="/formations"
              className={buttonClasses(
                'ghost',
                'lg',
                '!border-paper-light/30 !text-paper-light hover:!border-paper-light/60',
              )}
            >
              {t('cta.secondary')}
            </Link>
          </div>
          <p className="mt-9">
            <Link
              href="/enseigner"
              className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-paper-light/60 transition-colors hover:text-ochre"
            >
              <span>{t('cta.teachLink')}</span>
              <span
                aria-hidden="true"
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </p>
        </Container>
      </section>
    </>
  );
}
