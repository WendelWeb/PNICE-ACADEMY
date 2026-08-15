import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { courseTitle } from '@/lib/courseFields';
import { getCourseTeacherChips } from '@/lib/home/source';
import { getFxRate } from '@/lib/fx';
import { formatHtg, toHtgAt } from '@/lib/money';
import type { Course } from '@/data/courses';

/** Cards in the stack — enough to read as "an inventory", few enough to breathe. */
const SHOWCASE_COUNT = 3;

/**
 * The hero's right side: a staggered stack of REAL course cards, each signed
 * by its own teacher.
 *
 * This replaces the stamped cargo-manifest document (owner decision, août
 * 2026: the site must read as a marketplace where anyone sells courses, not
 * as one person's app — and the manifest, with its seal and document number,
 * was the single strongest "personal app" signal on the page). The
 * replacement makes the OPPOSITE statement with the same real data: several
 * courses, several author names, live prices in both currencies. Nothing
 * here is decorative inventory — every card is a published course a visitor
 * can open and buy right now, which is also why the whole stack simply
 * shrinks when the catalogue is small instead of padding itself with fakes.
 */
export async function HeroShowcase({ courses }: { courses: Course[] }) {
  const [t, locale, rate] = await Promise.all([
    getTranslations('home.hero.showcase'),
    getLocale(),
    getFxRate(),
  ]);

  const picks = courses.slice(0, SHOWCASE_COUNT);
  if (picks.length === 0) return null;
  const chips = await getCourseTeacherChips(picks.map((c) => c.slug));

  // Alternating tilt, center card flat — a pile of real offers, not a grid.
  const tilt = ['-rotate-[1.6deg]', 'rotate-0', 'rotate-[1.4deg]'];

  return (
    <div className="w-full lg:max-w-[26rem] lg:justify-self-end">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
        <span aria-hidden="true" className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
        </span>
        {t('live')}
      </p>

      <ul className="mt-4 space-y-3">
        {picks.map((course, i) => {
          const chip = chips[course.slug];
          return (
            <li key={course.slug} className={tilt[i % tilt.length]}>
              <Link
                href={`/formations/${course.slug}`}
                className="group flex items-center justify-between gap-4 rounded-xl border border-ink/15 bg-paper-light p-4 shadow-[0_14px_28px_-18px_rgba(16,32,74,0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-[15px] font-bold leading-snug text-ink group-hover:text-teal">
                    {courseTitle(course, locale)}
                  </span>
                  {chip && (
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-graphite/60">
                      {t('by', { name: chip.name })}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-lg font-black text-ink tabular-nums">
                    {course.priceUsd}$
                  </span>
                  <span className="block font-mono text-[10px] text-graphite/55 tabular-nums">
                    ~{formatHtg(toHtgAt(course.priceUsd, rate))}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {courses.length > picks.length && (
        <p className="mt-3 text-right">
          <Link
            href="/formations"
            className="font-mono text-[11px] text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
          >
            {t('more', { count: courses.length - picks.length })}
          </Link>
        </p>
      )}
    </div>
  );
}
