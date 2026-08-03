'use client';

import { useLocale, useTranslations } from 'next-intl';
import { IconCheck } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Sceau } from '@/components/ui/Sceau';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { Stars } from '@/components/reviews/Stars';
import { courseTitle, courseTagline, courseLearn, courseIsBilingual, coursePrimaryLocale } from '@/lib/courseFields';
import { categoryTone } from '@/lib/courseCategory';
import { cn } from '@/lib/cn';
import { getCourseTeacher } from '@/data/teachers';
import type { Course } from '@/data/courses';
import type { RatingSummary } from '@/lib/reviews/reviews';

/**
 * The catalogue's discovery card — used both by the interactive toolbar-driven
 * grid (CatalogBrowser) and the server-rendered fallback shown before it
 * hydrates. code + seal + title + category tag + 3 learn-bullets + price +
 * lesson count, per the U4 spec. Client component (next-intl hooks), but
 * composes fine inside a server-rendered subtree.
 *
 * Teacher attribution (M2): a subtle mono line at the card's foot, its own
 * real `<Link>` to /prof/[slug] — not nested inside the main course `<Link>`,
 * which would be invalid HTML and break keyboard/screen-reader navigation.
 *
 * ADDITIVE props (Stage: the living manifest — the home's featured grid
 * reuses THIS card so home and /formations stay one design):
 *   - `rating`: a real `RatingSummary` renders a star row (count > 0 only —
 *     no reviews, no claim). Omitted (every pre-existing call site) ⇒
 *     byte-identical card.
 *   - `teacher`: overrides the static-registry attribution (a DB-owned
 *     course by a 2nd+ real teacher). Omitted ⇒ the original
 *     `getCourseTeacher` fallback.
 */
export function CourseCatalogCard({
  course,
  rating,
  teacher: teacherProp,
}: {
  course: Course;
  rating?: RatingSummary | null;
  teacher?: { name: string; slug: string } | null;
}) {
  const locale = useLocale();
  const t = useTranslations('catalog');
  const tCourse = useTranslations('course');
  const learn = courseLearn(course, locale).slice(0, 3);
  const staticTeacher = getCourseTeacher(course.slug);
  const teacher =
    teacherProp ??
    (staticTeacher ? { name: staticTeacher.displayName, slug: staticTeacher.slug } : null);
  const showStars = Boolean(rating && rating.count > 0 && rating.avg !== null);
  // Honesty in the UI (Task: course-language): a monolingual course must say
  // so before a learner clicks through expecting the ht/fr pair every other
  // course has.
  const bilingual = courseIsBilingual(course);
  const primary = coursePrimaryLocale(course);

  return (
    <div className="card-hover group flex h-full flex-col rounded-xl border border-ink/12 bg-paper-light outline-none transition-colors hover:border-ink/35">
      <Link
        href={`/formations/${course.slug}`}
        className="flex flex-1 flex-col rounded-t-xl p-5 outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <div className="flex items-start justify-between gap-3">
          <Sceau
            size="xs"
            tone="ochre"
            rotate={-6}
            print
            className="card-hover-seal shrink-0"
          >
            <span className="font-display text-[12px] font-black leading-none">
              {course.code}
            </span>
          </Sceau>
          <span
            className={cn(
              'rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide',
              categoryTone[course.category],
            )}
          >
            {t(`categories.${course.category}`)}
          </span>
        </div>

        <h3 className="mt-4 font-display text-xl font-bold leading-tight text-ink">
          {courseTitle(course, locale)}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-graphite/75">
          {courseTagline(course, locale)}
        </p>
        {!bilingual && (
          <span className="mt-2 inline-flex w-fit items-center rounded-full border border-ink/12 bg-ink/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/55">
            {t(`languageBadge.${primary}`)}
          </span>
        )}

        <ul className="mt-4 space-y-1.5">
          {learn.map((point, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-snug text-graphite">
              <IconCheck size={14} className="mt-0.5 shrink-0 text-teal" />
              <span className="line-clamp-1">{point}</span>
            </li>
          ))}
        </ul>

        {showStars && (
          <span className="mt-3 flex items-center gap-1.5">
            <Stars value={rating!.avg!} size={13} />
            <span className="font-mono text-[11px] text-ink/55">
              {rating!.avg!.toFixed(1)} ({rating!.count})
            </span>
          </span>
        )}

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-ink/10 pt-4">
          <div>
            <Price
              usd={course.priceUsd}
              className="font-mono text-lg font-semibold text-ink"
            />
            <PriceSecondary
              usd={course.priceUsd}
              className="ml-1 font-mono text-[11px] text-graphite/55"
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] text-graphite/55">
            {tCourse('lessonsCount', { count: course.lessons.length })}
          </span>
        </div>
      </Link>

      {teacher && (
        <Link
          href={`/prof/${teacher.slug}`}
          className="rounded-b-xl border-t border-ink/10 px-5 py-3 font-mono text-[11px] text-ink/60 transition-colors hover:text-ochre"
        >
          {t('teacherLine', { name: teacher.name })}
        </Link>
      )}
    </div>
  );
}
