'use client';

import { useLocale, useTranslations } from 'next-intl';
import { IconCheck } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Sceau } from '@/components/ui/Sceau';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { courseTitle, courseTagline, courseLearn } from '@/lib/courseFields';
import { cn } from '@/lib/cn';
import type { Course, CourseCategory } from '@/data/courses';

const categoryTone: Record<CourseCategory, string> = {
  biznis: 'bg-ink/8 text-ink/70',
  dijital: 'bg-teal/10 text-teal',
  lajan: 'bg-ochre/15 text-ochre',
  'lavi-pratik': 'bg-graphite/10 text-graphite/80',
};

/**
 * The catalogue's discovery card — used both by the interactive toolbar-driven
 * grid (CatalogBrowser) and the server-rendered fallback shown before it
 * hydrates. code + seal + title + category tag + 3 learn-bullets + price +
 * lesson count, per the U4 spec. Client component (next-intl hooks), but
 * composes fine inside a server-rendered subtree.
 */
export function CourseCatalogCard({ course }: { course: Course }) {
  const locale = useLocale();
  const t = useTranslations('catalog');
  const tCourse = useTranslations('course');
  const learn = courseLearn(course, locale).slice(0, 3);

  return (
    <Link
      href={`/formations/${course.slug}`}
      className="card-hover group flex h-full flex-col rounded-xl border border-ink/12 bg-paper-light p-5 outline-none transition-colors hover:border-ink/35 focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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

      <ul className="mt-4 space-y-1.5">
        {learn.map((point, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug text-graphite">
            <IconCheck size={14} className="mt-0.5 shrink-0 text-teal" />
            <span className="line-clamp-1">{point}</span>
          </li>
        ))}
      </ul>

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
  );
}
