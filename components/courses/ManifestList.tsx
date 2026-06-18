import { getLocale, getTranslations } from 'next-intl/server';
import { IconChevronRight } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Reveal } from '@/components/ui/Reveal';
import { CourseIcon } from '@/components/courses/CourseIcon';
import { courseTitle, courseTagline } from '@/lib/courseFields';
import { formatUsd, htgLabel } from '@/lib/money';
import type { Course } from '@/data/courses';

/**
 * The cargo-manifest view: each formation is one numbered line.
 * Shared by the homepage and the catalogue.
 */
export async function ManifestList({ courses }: { courses: Course[] }) {
  const locale = await getLocale();
  const t = await getTranslations('home.manifest');

  return (
    <ul className="border-y border-ink/10">
      {courses.map((c, i) => (
        <li key={c.code} className="border-b border-ink/10 last:border-b-0">
          <Reveal delay={i * 55}>
            <Link
              href={`/formations/${c.slug}`}
              className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md px-1 py-5 transition-colors hover:bg-ochre/[0.06] md:gap-6 md:px-3"
            >
              <span className="font-display text-3xl font-black leading-none text-ochre tabular-nums md:text-4xl">
                {String(i + 1).padStart(2, '0')}
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CourseIcon name={c.icon} size={17} className="shrink-0 text-teal" />
                  <span className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
                    {c.code}
                  </span>
                </div>
                <h3 className="mt-1 truncate font-display text-xl font-bold text-ink md:text-2xl">
                  {courseTitle(c, locale)}
                </h3>
                <p className="truncate text-sm text-graphite/75">
                  {courseTagline(c, locale)}
                </p>
              </div>

              <div className="flex items-center gap-3 md:gap-5">
                <div className="text-right">
                  <div className="font-mono text-lg font-semibold text-ink transition-transform duration-150 group-hover:-rotate-2">
                    {formatUsd(c.priceUsd)}
                  </div>
                  <div className="font-mono text-[11px] text-graphite/55">
                    ~{htgLabel(c.priceUsd)}
                  </div>
                  <div className="mt-1 inline-block rounded bg-ochre/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ochre">
                    {t('included')}
                  </div>
                </div>
                <IconChevronRight
                  size={20}
                  className="shrink-0 text-ink/25 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-ochre"
                />
              </div>
            </Link>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
