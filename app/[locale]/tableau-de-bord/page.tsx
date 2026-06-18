import type { Metadata } from 'next';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { CourseIcon } from '@/components/courses/CourseIcon';
import { getCourse } from '@/data/courses';
import { courseTitle } from '@/lib/courseFields';

export const metadata: Metadata = { title: 'Tablo debò — PNICE Academy' };

// DEMO — mock enrollments to show the dashboard structure.
const ENROLLED = [
  { slug: 'zouti-finansye-dijital', done: 3 },
  { slug: 'biznis-shipping', done: 1 },
  { slug: 'ia-whatsapp-telegram', done: 0 },
];

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  return (
    <Section>
      <Container>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-teal">
          {t('greeting')}
        </p>
        <h1 className="mt-2 font-display text-4xl font-black text-ink md:text-5xl">
          {t('title')}
        </h1>

        <h2 className="mt-10 font-display text-2xl font-bold text-ink">
          {t('myCourses')}
        </h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {ENROLLED.map(({ slug, done }) => {
            const course = getCourse(slug);
            if (!course) return null;
            const total = course.lessons.length;
            const pct = Math.round((done / total) * 100);
            const next = Math.min(done + 1, total);
            const complete = done >= total;
            return (
              <div
                key={slug}
                className="flex flex-col rounded-xl border border-ink/12 bg-paper-light p-6"
              >
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
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-ochre"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <Link
                  href={`/tableau-de-bord/${slug}/lecon/${next}`}
                  className={buttonClasses('dark', 'md', 'mt-6 w-full')}
                >
                  {t('continue')}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-8 font-mono text-[11px] text-graphite/50">
          {t('demoNote')}
        </p>
      </Container>
    </Section>
  );
}
