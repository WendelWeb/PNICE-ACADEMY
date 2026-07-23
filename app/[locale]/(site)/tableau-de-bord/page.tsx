import type { Metadata } from 'next';
import { IconArrowRight, IconCompass } from '@tabler/icons-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { currentUser } from '@clerk/nextjs/server';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { Sceau } from '@/components/ui/Sceau';
import { CourseProgressRoute } from '@/components/dashboard/CourseProgressRoute';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { CourseIcon } from '@/components/courses/CourseIcon';
import { SmartImage } from '@/components/ui/SmartImage';
import { courseImageSrc } from '@/lib/courseImage';
import { getCourse, type Course } from '@/data/courses';
import { courseTitle } from '@/lib/courseFields';
import { clerkEnabled } from '@/lib/clerk';

// Reads per-request Clerk identity for the greeting — never cache across users.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tablo debò — PNICE Academy' };

// DEMO — mock enrollments to show the dashboard structure. No timestamp
// field exists yet (real enrollment data isn't wired up), so "continue
// where you left off" is approximated from this existing shape: the first
// in-progress course (0 < done < total) in array order, falling back to the
// first not-yet-started one. See u7-report.md for the full rationale.
const ENROLLED = [
  { slug: 'zouti-finansye-dijital', done: 3 },
  { slug: 'biznis-shipping', done: 1 },
  { slug: 'ia-whatsapp-telegram', done: 0 },
];

type Enrollment = { slug: string; done: number; course: Course; total: number };

function CourseCard({
  enrollment,
  locale,
  t,
}: {
  enrollment: Enrollment;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const { slug, done, course, total } = enrollment;
  const next = Math.min(done + 1, total);
  const complete = done >= total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="card-hover flex flex-col overflow-hidden rounded-xl border border-ink/12 bg-paper-light hover:border-ink/35">
      <div className="relative aspect-[16/9] bg-paper">
        <SmartImage
          src={courseImageSrc(course.code)}
          alt={courseTitle(course, locale)}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
        <Sceau
          size="xs"
          tone="ochre"
          rotate={-6}
          print
          className="card-hover-seal absolute left-3 top-3"
        >
          <span className="font-display text-[11px] font-black leading-none">
            {course.code}
          </span>
        </Sceau>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center gap-2">
          <CourseIcon name={course.icon} size={18} className="text-teal" />
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
            {course.code}
          </span>
        </div>
        <h3 className="mt-2 font-display text-xl font-bold leading-tight text-ink">
          {courseTitle(course, locale)}
        </h3>

        <div className="mt-5">
          <div className="flex items-center justify-between font-mono text-xs text-graphite/60">
            <span>{t('progressDone', { done, total })}</span>
            <span>{complete ? t('completed') : `${pct}%`}</span>
          </div>
          <CourseProgressRoute total={total} done={done} className="mt-3" />
        </div>

        <Link
          href={`/tableau-de-bord/${slug}/lecon/${next}`}
          className={buttonClasses('dark', 'md', 'mt-6 w-full')}
        >
          {done === 0 ? t('start') : t('continue')}
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  const user = clerkEnabled ? await currentUser() : null;
  const name = user?.firstName || user?.username || null;

  const enrollments: Enrollment[] = ENROLLED.map(({ slug, done }) => {
    const course = getCourse(slug);
    if (!course) return null;
    return { slug, done, course, total: course.lessons.length };
  }).filter((e): e is Enrollment => e !== null);

  // "Continue where you left off" — the first course still in progress;
  // failing that, the first one not yet started. See ENROLLED note above.
  const continueEnrollment =
    enrollments.find((e) => e.done > 0 && e.done < e.total) ??
    enrollments.find((e) => e.done === 0) ??
    null;
  const restEnrollments = continueEnrollment
    ? enrollments.filter((e) => e.slug !== continueEnrollment.slug)
    : enrollments;

  return (
    <Section>
      <Container>
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-teal">
            {name ? t('greetingNamed', { name }) : t('greeting')}
          </p>
          <h1 className="mt-2 font-display text-4xl font-black text-ink md:text-5xl">
            {t('title')}
          </h1>
        </Reveal>

        {enrollments.length === 0 ? (
          <Reveal delay={80}>
            <div className="mt-10 rounded-2xl border border-dashed border-ink/25 bg-paper-light px-8 py-14 text-center md:py-20">
              <span aria-hidden="true" className="block">
                <Sceau size="sm" tone="ink" rotate={-6} className="mx-auto">
                  <IconCompass size={30} stroke={1.5} />
                </Sceau>
              </span>
              <h2 className="mt-6 font-display text-2xl font-bold text-ink md:text-3xl">
                {t('emptyTitle')}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-graphite/70">
                {t('emptyBody')}
              </p>
              <Link
                href="/formations"
                className={buttonClasses('primary', 'lg', 'mt-7')}
              >
                {t('emptyCta')}
                <IconArrowRight size={18} />
              </Link>
            </div>
          </Reveal>
        ) : (
          <>
            {continueEnrollment ? (
              <Reveal delay={80}>
                <div className="mt-10">
                  <Eyebrow>{t('continueTitle')}</Eyebrow>
                  <div className="mt-3 overflow-hidden rounded-2xl border-2 border-teal/25 bg-paper-light">
                    <div className="grid gap-0 md:grid-cols-[minmax(0,340px)_1fr]">
                      <div className="relative aspect-[16/9] bg-paper md:aspect-auto md:min-h-[280px]">
                        <SmartImage
                          src={courseImageSrc(continueEnrollment.course.code)}
                          alt={courseTitle(continueEnrollment.course, locale)}
                          fill
                          sizes="(max-width: 768px) 100vw, 340px"
                          className="object-cover"
                        />
                        <span className="absolute left-3 top-3 rounded bg-ink/85 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-paper-light">
                          {continueEnrollment.course.code}
                        </span>
                      </div>
                      <div className="flex flex-col justify-center p-6 md:p-8">
                        <div className="flex items-center gap-2">
                          <CourseIcon
                            name={continueEnrollment.course.icon}
                            size={18}
                            className="text-teal"
                          />
                          <span className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
                            {continueEnrollment.course.code}
                          </span>
                        </div>
                        <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-ink md:text-3xl">
                          {courseTitle(continueEnrollment.course, locale)}
                        </h2>

                        <div className="mt-5 max-w-sm">
                          <div className="flex items-center justify-between font-mono text-xs text-graphite/60">
                            <span>
                              {t('progressDone', {
                                done: continueEnrollment.done,
                                total: continueEnrollment.total,
                              })}
                            </span>
                            <span>
                              {Math.round(
                                (continueEnrollment.done / continueEnrollment.total) * 100,
                              )}
                              %
                            </span>
                          </div>
                          <CourseProgressRoute
                            total={continueEnrollment.total}
                            done={continueEnrollment.done}
                            className="mt-3"
                          />
                        </div>

                        <Link
                          href={`/tableau-de-bord/${continueEnrollment.slug}/lecon/${Math.min(
                            continueEnrollment.done + 1,
                            continueEnrollment.total,
                          )}`}
                          className={buttonClasses('primary', 'lg', 'mt-7 w-fit')}
                        >
                          {continueEnrollment.done === 0 ? t('start') : t('continue')}
                          <IconArrowRight size={18} />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ) : null}

            {restEnrollments.length > 0 ? (
              <>
                <Reveal delay={140}>
                  <h2 className="mt-12 font-display text-2xl font-bold text-ink">
                    {t('myCourses')}
                  </h2>
                </Reveal>

                <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {restEnrollments.map((enrollment, i) => (
                    <Reveal key={enrollment.slug} delay={160 + Math.min(i, 6) * 60}>
                      <CourseCard enrollment={enrollment} locale={locale} t={t} />
                    </Reveal>
                  ))}
                </div>
              </>
            ) : null}

            <Reveal delay={220}>
              <p className="mt-8 font-mono text-[11px] text-graphite/50">
                {t('demoNote')}
              </p>
            </Reveal>
          </>
        )}
      </Container>
    </Section>
  );
}
