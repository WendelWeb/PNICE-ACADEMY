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
import type { CourseChapterView, CurriculumLesson } from '@/data/courseDetails';
import { getCourseBySlug, getCourseDetail } from '@/lib/courses/source';
import { courseTitle, lessonTitle } from '@/lib/courseFields';
import { cn } from '@/lib/cn';
import { clerkEnabled } from '@/lib/clerk';
import { hasCourseAccess, getCourseProgress, getActiveTeacherPassOwner } from '@/lib/learner/access';
import { MarkLessonDoneButton } from '@/components/dashboard/MarkLessonDoneButton';
import { LessonPlayer as LessonVideoPlayer } from '@/components/learn/LessonPlayer';
import { ResourceLinks } from '@/components/courses/ResourceLinks';

// Reads per-request Clerk identity + live DB access/progress — never cache
// across users, and never prerendered (course/lesson access is per-learner).
export const dynamic = 'force-dynamic';

/**
 * One rail row — extracted so both the pre-K3 flat list and the K3 grouped-
 * by-chapter list render an IDENTICAL row (same classes/behavior), only the
 * wrapping structure differs.
 */
function LessonRailRow({
  slug,
  idx,
  title,
  n,
  access,
  completed,
  preview,
}: {
  slug: string;
  idx: number;
  title: string;
  n: number;
  access: boolean;
  completed: Set<number>;
  /** Whether THIS lesson is the teacher's own free preview. Passed in rather
   *  than derived from `idx` — deriving it from the position is exactly what
   *  used to give away lesson 1 of every course on the platform. */
  preview: boolean;
}) {
  const isCurrent = idx === n;
  const done = completed.has(idx);
  // Locked = neither a purchased/subscribed access nor a free preview —
  // clicking it would just redirect to the sales page (real gate, not demo).
  const locked = !access && !preview;
  return (
    <li>
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
          {title}
        </span>
        {locked && !isCurrent && (
          <IconLock size={14} className="shrink-0 text-ink/25" />
        )}
      </Link>
    </li>
  );
}

function LessonRailList({
  course,
  slug,
  n,
  locale,
  access,
  completed,
  chapters,
  ungrouped,
  t,
}: {
  course: Course;
  slug: string;
  n: number;
  locale: string;
  access: boolean;
  completed: Set<number>;
  /** Task K3 — curriculum grouping (empty for the 9 flat courses + the no-DB
   *  static fallback, in which case the rail renders EXACTLY as before). */
  chapters: CourseChapterView[];
  ungrouped: CurriculumLesson[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (chapters.length === 0) {
    // Zero chapters — the pre-K3 flat rail, byte-identical to before.
    return (
      <ol className="divide-y divide-ink/10">
        {course.lessons.map((l, i) => (
          <LessonRailRow
            key={i}
            slug={slug}
            idx={i + 1}
            title={lessonTitle(l, locale)}
            n={n}
            access={access}
            completed={completed}
            preview={isPreviewLesson(course.lessons, i + 1)}
          />
        ))}
      </ol>
    );
  }

  return (
    <div>
      {chapters.map((c, ci) => (
        <div key={c.id} className="border-b border-ink/10 last:border-b-0">
          <p className="bg-paper px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/45">
            {t('partLabel', { n: ci + 1, title: locale === 'ht' ? c.title_ht : c.title_fr })}
          </p>
          <ol className="divide-y divide-ink/10">
            {c.lessons.map((l) => (
              <LessonRailRow
                key={l.id}
                slug={slug}
                idx={l.index}
                title={lessonTitle(l, locale)}
                n={n}
                access={access}
                completed={completed}
                preview={isPreviewLesson(course.lessons, l.index)}
              />
            ))}
          </ol>
        </div>
      ))}
      {ungrouped.length > 0 && (
        <ol className="divide-y divide-ink/10">
          {ungrouped.map((l) => (
            <LessonRailRow
              key={l.id}
              slug={slug}
              idx={l.index}
              title={lessonTitle(l, locale)}
              n={n}
              access={access}
              completed={completed}
              preview={isPreviewLesson(course.lessons, l.index)}
            />
          ))}
        </ol>
      )}
    </div>
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
  const preview = isPreviewLesson(course.lessons, n);
  const t = await getTranslations('lesson');

  // Binding access model (Task L1, updated by Task: two subscription
  // products): reachable only with real course access, or if this specific
  // lesson is a free preview. Otherwise → buy page — UNLESS the learner
  // holds an active subscription that just doesn't cover THIS course (a
  // teacher pass for a DIFFERENT teacher): a silent redirect there is a dead
  // end that reads like a bug ("I thought I had a subscription!"). That case
  // renders its own explanatory card below instead, and returns early —
  // before `current`/the video player are ever touched — so an unauthorized
  // viewer still never reaches the lesson content itself.
  if (!access && !preview) {
    const heldPass = clerkId ? await getActiveTeacherPassOwner(clerkId) : null;
    if (!heldPass) {
      redirect(`/${locale}/formations/${slug}`);
    }
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-ink/12 bg-paper-light p-8 text-center">
          <IconLock size={26} className="mx-auto text-ochre" />
          <h1 className="mt-4 font-display text-2xl font-black text-ink">
            {t('teacherPassMismatch.title')}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-graphite/75">
            {t('teacherPassMismatch.body', { name: heldPass.displayName })}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/checkout?plan=sub" className={buttonClasses('primary', 'md')}>
              {t('teacherPassMismatch.upgradeCta')}
            </Link>
            <Link href={`/formations/${slug}`} className={buttonClasses('ghost', 'md')}>
              {t('teacherPassMismatch.buyThisCta')}
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  const completed = access && clerkId ? await getCourseProgress(clerkId, slug) : new Set<number>();

  const current = course.lessons[n - 1];

  // Task K3 — curriculum grouping (chapters/notes/resources), read alongside
  // the flat `course` above (same pattern the sales page already uses: two
  // independent DB reads, gated + never-throw). `chapters`/`ungrouped` are
  // `[]` with no DB or zero authored chapters — the rail/label branches below
  // then render EXACTLY as before this task. `curriculumFlat` reconstructs
  // the SAME global order as `course.lessons` (both sorted ascending by the
  // same `lessons.index` column over the same rows), so array POSITION
  // `n - 1` lines up with `course.lessons[n - 1]` — matching how `current`
  // above is already resolved.
  const detail = await getCourseDetail(slug);
  const chapters = detail?.chapters ?? [];
  const ungrouped = detail?.ungroupedLessons ?? [];
  const curriculumFlat = [...chapters.flatMap((c) => c.lessons), ...ungrouped].sort(
    (a, b) => a.index - b.index,
  );
  const currentCurriculum = curriculumFlat[n - 1];

  let partContext: { part: number; lessonInPart: number } | null = null;
  if (currentCurriculum) {
    const chapterIdx = chapters.findIndex((c) => c.lessons.some((l) => l.id === currentCurriculum.id));
    if (chapterIdx !== -1) {
      const lessonInPart = chapters[chapterIdx].lessons.findIndex((l) => l.id === currentCurriculum.id) + 1;
      partContext = { part: chapterIdx + 1, lessonInPart };
    }
  }

  const notes = currentCurriculum ? (locale === 'ht' ? currentCurriculum.notes_ht : currentCurriculum.notes_fr) : '';
  const lessonResources = currentCurriculum?.resources ?? [];

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
            chapters={chapters}
            ungrouped={ungrouped}
            t={t}
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
            {partContext
              ? t('partAndLesson', { part: partContext.part, n: partContext.lessonInPart })
              : t('lessonOf', { n, total })}
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

          {/* Task K3 — teacher notes + resources, under the player. Sourced
              from the same lesson the learner is already gated into above
              (access OR free preview) — no separate gate needed. Absent with
              no DB / no chapters+notes/resources authored (currentCurriculum
              undefined ⇒ notes = '' and lessonResources = []). */}
          {notes && (
            <div className="mt-8">
              <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
                {t('notesTitle')}
              </h2>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-graphite">
                {notes}
              </p>
            </div>
          )}

          {lessonResources.length > 0 && (
            <div className="mt-8">
              <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
                {t('resourcesTitle')}
              </h2>
              <div className="mt-3">
                <ResourceLinks resources={lessonResources} locale={locale} />
              </div>
            </div>
          )}
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
              chapters={chapters}
              ungrouped={ungrouped}
              t={t}
            />
          </div>
        </aside>
      </div>
    </Container>
  );
}
