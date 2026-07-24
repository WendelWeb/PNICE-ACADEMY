import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLock,
  IconChevronDown,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Container } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';
import { isPreviewLesson, type Course } from '@/data/courses';
import { getCourseBySlug } from '@/lib/courses/source';
import { courseTitle, lessonTitle } from '@/lib/courseFields';
import { cn } from '@/lib/cn';
import { clerkEnabled } from '@/lib/clerk';
import { hasCourseAccess, getCourseProgress } from '@/lib/learner/access';
import { MarkLessonDoneButton } from '@/components/dashboard/MarkLessonDoneButton';
import { LessonPlayer as LessonVideoPlayer } from '@/components/learn/LessonPlayer';

// Reads per-request Clerk identity + live DB access/progress — never cache
// across users, and never prerendered (course/lesson access is per-learner).
export const dynamic = 'force-dynamic';

function LessonRailList({
  course,
  slug,
  n,
  locale,
  access,
  completed,
}: {
  course: Course;
  slug: string;
  n: number;
  locale: string;
  access: boolean;
  completed: Set<number>;
}) {
  return (
    <ol className="divide-y divide-ink/10">
      {course.lessons.map((l, i) => {
        const idx = i + 1;
        const isCurrent = idx === n;
        const done = completed.has(idx);
        // Locked = neither a purchased/subscribed access nor a free preview —
        // clicking it would just redirect to the sales page (real gate, not demo).
        const locked = !access && !isPreviewLesson(idx);
        return (
          <li key={i}>
            <Link
              href={`/tableau-de-bord/${slug}/lecon/${idx}`}
              className={cn(
                'flex items-center gap-3 px-4 py-3.5 transition-colors',
                isCurrent ? 'bg-ochre/10' : 'hover:bg-ink/[0.03]',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[11px] transition-colors',
                  done && '-rotate-6 border-teal bg-teal text-paper-light',
                  isCurrent && !done && 'border-ochre bg-ochre text-[#1b1207]',
                  !done && !isCurrent && 'border-ink/20 text-ink/50',
                )}
              >
                {done ? <IconCheck size={14} /> : idx}
              </span>
              <span
                className={cn(
                  'flex-1 text-sm',
                  isCurrent ? 'font-semibold text-ink' : 'text-graphite/80',
                )}
              >
                {lessonTitle(l, locale)}
              </span>
              {locked && !isCurrent && (
                <IconLock size={14} className="shrink-0 text-ink/25" />
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export default async function LessonPlayer({
  params: { locale, course: slug, id },
}: {
  params: { locale: string; course: string; id: string };
}) {
  setRequestLocale(locale);
  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const total = course.lessons.length;
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n) || n < 1 || n > total) notFound();

  const clerkId = clerkEnabled ? (await auth()).userId : null;
  const access = clerkId ? await hasCourseAccess(clerkId, slug) : false;
  const preview = isPreviewLesson(n);

  // Binding access model (Task L1): reachable only with real course access,
  // or if this specific lesson is a free preview. Otherwise → buy page.
  if (!access && !preview) {
    redirect(`/${locale}/formations/${slug}`);
  }

  const completed = access && clerkId ? await getCourseProgress(clerkId, slug) : new Set<number>();

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

      {/* Lesson list — collapsible, sits above the player on mobile/tablet. */}
      <details className="group mt-5 rounded-xl border border-ink/12 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
            {t('lessonsList')} · {t('lessonOf', { n, total })}
          </span>
          <IconChevronDown
            size={16}
            className="shrink-0 text-ink/40 transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-ink/10">
          <LessonRailList
            course={course}
            slug={slug}
            n={n}
            locale={locale}
            access={access}
            completed={completed}
          />
        </div>
      </details>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Player */}
        <div>
          <LessonVideoPlayer
            videoId={current.bunnyVideoId}
            title={lessonTitle(current, locale)}
            placeholderNote={t('playerNote')}
          />

          <p className="mt-5 font-mono text-xs uppercase tracking-wide text-teal">
            {t('lessonOf', { n, total })}
          </p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight text-ink">
            {lessonTitle(current, locale)}
          </h1>

          {!access && preview ? (
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-graphite/70">
              {t('previewNotice')}
            </p>
          ) : null}

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

            {access ? (
              <MarkLessonDoneButton
                courseSlug={slug}
                lessonIndex={n}
                initialDone={completed.has(n)}
                markLabel={t('markDone')}
                doneLabel={t('doneLabel')}
                certIssuedToast={t('certIssuedToast')}
                viewCertificateLabel={t('viewCertificate')}
              />
            ) : (
              <Link
                href={`/formations/${slug}`}
                className={buttonClasses('primary', 'md')}
              >
                {t('buyForAccess')}
              </Link>
            )}

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

        {/* Lesson list — desktop rail */}
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
            {t('lessonsList')}
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-ink/12">
            <LessonRailList
              course={course}
              slug={slug}
              n={n}
              locale={locale}
              access={access}
              completed={completed}
            />
          </div>
        </aside>
      </div>
    </Container>
  );
}
