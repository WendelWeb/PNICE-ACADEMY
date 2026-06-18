import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  IconArrowLeft,
  IconArrowRight,
  IconPlayerPlayFilled,
  IconCheck,
  IconLock,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Container } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';
import { getCourse } from '@/data/courses';
import { courseTitle, lessonTitle } from '@/lib/courseFields';
import { cn } from '@/lib/cn';

export default async function LessonPlayer({
  params: { locale, course: slug, id },
}: {
  params: { locale: string; course: string; id: string };
}) {
  setRequestLocale(locale);
  const course = getCourse(slug);
  if (!course) notFound();

  const total = course.lessons.length;
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n) || n < 1 || n > total) notFound();

  const t = await getTranslations('lesson');
  const current = course.lessons[n - 1];

  return (
    <Container className="py-10">
      <Link
        href="/tableau-de-bord"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/60 transition-colors hover:text-ochre"
      >
        <IconArrowLeft size={15} />
        {courseTitle(course, locale)}
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Player */}
        <div>
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-ink/12 bg-ink">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ochre text-[#1b1207]">
              <IconPlayerPlayFilled size={28} />
            </div>
            <span className="absolute bottom-3 left-4 max-w-[80%] font-mono text-[11px] leading-relaxed text-paper-light/55">
              {t('playerNote')}
            </span>
          </div>

          <p className="mt-5 font-mono text-xs uppercase tracking-wide text-teal">
            {t('lessonOf', { n, total })}
          </p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight text-ink">
            {lessonTitle(current, locale)}
          </h1>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {n > 1 ? (
              <Link
                href={`/tableau-de-bord/${slug}/lecon/${n - 1}`}
                className={buttonClasses('ghost', 'md')}
              >
                <IconArrowLeft size={16} />
                {t('prev')}
              </Link>
            ) : null}
            <button type="button" className={buttonClasses('dark', 'md')}>
              <IconCheck size={16} />
              {t('markDone')}
            </button>
            {n < total ? (
              <Link
                href={`/tableau-de-bord/${slug}/lecon/${n + 1}`}
                className={buttonClasses('primary', 'md')}
              >
                {t('next')}
                <IconArrowRight size={16} />
              </Link>
            ) : null}
          </div>
        </div>

        {/* Lesson list */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
            {t('lessonsList')}
          </h2>
          <ol className="mt-4 overflow-hidden rounded-xl border border-ink/12">
            {course.lessons.map((l, i) => {
              const idx = i + 1;
              const isCurrent = idx === n;
              const done = idx < n; // DEMO — lessons before current shown done
              return (
                <li key={i} className="border-b border-ink/10 last:border-b-0">
                  <Link
                    href={`/tableau-de-bord/${slug}/lecon/${idx}`}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3.5 transition-colors',
                      isCurrent ? 'bg-ochre/10' : 'hover:bg-ink/[0.03]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px]',
                        done
                          ? 'bg-teal text-paper-light'
                          : isCurrent
                            ? 'bg-ochre text-[#1b1207]'
                            : 'border border-ink/20 text-ink/50',
                      )}
                    >
                      {done ? <IconCheck size={13} /> : idx}
                    </span>
                    <span
                      className={cn(
                        'flex-1 text-sm',
                        isCurrent ? 'font-semibold text-ink' : 'text-graphite/80',
                      )}
                    >
                      {lessonTitle(l, locale)}
                    </span>
                    {!done && !isCurrent && (
                      <IconLock size={14} className="shrink-0 text-ink/25" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </Container>
  );
}
