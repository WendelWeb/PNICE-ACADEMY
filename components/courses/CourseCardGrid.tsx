import { getLocale, getTranslations } from 'next-intl/server';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Reveal } from '@/components/ui/Reveal';
import { CourseIcon } from '@/components/courses/CourseIcon';
import { CourseSlideshow } from '@/components/courses/CourseSlideshow';
import { courseImageList } from '@/lib/courseImage';
import { courseTitle, courseTagline } from '@/lib/courseFields';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { getCourseTeacher } from '@/data/teachers';
import type { Course } from '@/data/courses';

export async function CourseCardGrid({ courses }: { courses: Course[] }) {
  const locale = await getLocale();
  const t = await getTranslations('home.manifest');
  const tCat = await getTranslations('catalog');

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c, i) => {
        // Stage 3 — DB-first: the photos a teacher uploads in the studio are
        // what students see here (fallback: repo filesystem, then SVG).
        const images = courseImageList(c.images, c.code);
        const hasImage = !images[0].endsWith('.svg');
        const teacher = getCourseTeacher(c.slug);
        return (
        <Reveal key={c.code} delay={(i % 3) * 70}>
          {/* `group` lives on this wrapper (not the course Link) so the
              teacher-attribution line below can be its own real, focusable
              link — nesting an <a> inside another <a> is invalid HTML and
              breaks keyboard/screen-reader navigation. */}
          <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-ink/12 bg-paper-light transition-all duration-200 hover:-translate-y-1 hover:border-ochre/40 hover:shadow-xl hover:shadow-ink/10">
            <Link href={`/formations/${c.slug}`} className="flex flex-1 flex-col">
              {/* media */}
              <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                <CourseSlideshow
                  images={images}
                  alt={`${courseTitle(c, locale)} — PNICE Academy`}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <span className="absolute left-3 top-3 flex h-9 min-w-9 items-center justify-center rounded-full bg-paper-light/95 px-2 font-display text-lg font-black leading-none text-ink shadow-sm">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {!hasImage && (
                  <span className="absolute right-3 top-3 rounded bg-ink/85 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-paper-light">
                    {c.code}
                  </span>
                )}
              </div>

              {/* body */}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2">
                  <CourseIcon name={c.icon} size={16} className="text-teal" />
                  <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">
                    {tCat(`categories.${c.category}`)}
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
                    <Price
                      usd={c.priceUsd}
                      className="font-mono text-lg font-semibold text-ink"
                    />
                    <PriceSecondary
                      usd={c.priceUsd}
                      className="ml-1 font-mono text-[11px] text-graphite/55"
                    />
                  </div>
                  <IconArrowRight
                    size={18}
                    className="text-ink/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-ochre"
                  />
                </div>
              </div>
            </Link>

            {teacher && (
              <Link
                href={`/prof/${teacher.slug}`}
                className="border-t border-ink/10 px-5 py-3 font-mono text-[11px] text-ink/50 transition-colors hover:text-ochre"
              >
                {t('teacherLine', { name: teacher.displayName })}
              </Link>
            )}
          </div>
        </Reveal>
        );
      })}
    </div>
  );
}
