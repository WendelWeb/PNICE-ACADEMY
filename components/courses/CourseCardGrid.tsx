import { getLocale, getTranslations } from 'next-intl/server';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Reveal } from '@/components/ui/Reveal';
import { CourseIcon } from '@/components/courses/CourseIcon';
import { CourseSlideshow } from '@/components/courses/CourseSlideshow';
import { courseImages } from '@/lib/courseImage';
import { courseTitle, courseTagline } from '@/lib/courseFields';
import { formatUsd, htgLabel } from '@/lib/money';
import type { Course } from '@/data/courses';

export async function CourseCardGrid({ courses }: { courses: Course[] }) {
  const locale = await getLocale();
  const t = await getTranslations('home.manifest');

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c, i) => (
        <Reveal key={c.code} delay={(i % 3) * 70}>
          <Link
            href={`/formations/${c.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-xl border border-ink/12 bg-paper-light transition-all duration-200 hover:-translate-y-1 hover:border-ochre/40 hover:shadow-xl hover:shadow-ink/10"
          >
            {/* media */}
            <div className="relative aspect-[4/3] overflow-hidden bg-paper">
              <CourseSlideshow
                images={courseImages(c.code)}
                alt={`${courseTitle(c, locale)} — PNICE Academy`}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <span className="absolute left-3 top-3 flex h-9 min-w-9 items-center justify-center rounded-full bg-paper-light/95 px-2 font-display text-lg font-black leading-none text-ink shadow-sm">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="absolute right-3 top-3 rounded bg-ink/85 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-paper-light">
                {c.code}
              </span>
            </div>

            {/* body */}
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center gap-2">
                <CourseIcon name={c.icon} size={16} className="text-teal" />
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">
                  {t('included')}
                </span>
              </div>
              <h3 className="mt-2 font-display text-xl font-bold leading-tight text-ink">
                {courseTitle(c, locale)}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-graphite/75">
                {courseTagline(c, locale)}
              </p>

              <div className="mt-4 flex items-end justify-between border-t border-ink/10 pt-4">
                <div>
                  <span className="font-mono text-lg font-semibold text-ink">
                    {formatUsd(c.priceUsd)}
                  </span>
                  <span className="ml-1 font-mono text-[11px] text-graphite/55">
                    ~{htgLabel(c.priceUsd)}
                  </span>
                </div>
                <IconArrowRight
                  size={18}
                  className="text-ink/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-ochre"
                />
              </div>
            </div>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}
