'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { IconSearch, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { Reveal } from '@/components/ui/Reveal';
import { CourseCatalogCard } from '@/components/courses/CourseCatalogCard';
import { COURSE_CATEGORIES, type Course, type CourseCategory } from '@/data/courses';
import { getCourseTeacher } from '@/data/teachers';
import type { TeacherChip } from '@/lib/home/source';

type SortKey = 'priceAsc' | 'priceDesc' | 'az';
const SORTS: SortKey[] = ['priceAsc', 'priceDesc', 'az'];
const DEFAULT_SORT: SortKey = 'priceAsc';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/** Diacritic-insensitive, case-insensitive normalisation for search matching. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Matches title + tagline + learn bullets in BOTH ht and fr, regardless of the active locale. */
function matchesQuery(course: Course, needle: string): boolean {
  if (!needle) return true;
  const haystack = normalize(
    [
      course.title_ht,
      course.title_fr,
      course.tagline_ht,
      course.tagline_fr,
      ...course.learn_ht,
      ...course.learn_fr,
    ].join(' '),
  );
  return haystack.includes(needle);
}

function mergeParams(
  current: URLSearchParams,
  patch: Record<string, string | null>,
): string {
  const params = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') params.delete(k);
    else params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * The interactive discovery toolbar for /formations: debounced text search
 * (both languages), category chips, a teacher filter, locale-aware sort,
 * results count and a styled empty state. State is synced to the URL
 * (?q=&cat=&sort=&teacher=) so it survives reload/sharing. Hydrates over a
 * server-rendered unfiltered grid (see the Suspense fallback in the page) so
 * the plain catalogue stays crawlable without JS.
 *
 * Teacher filter (Task C3-T7, upgraded Stage 4): attribution now prefers the
 * server-resolved `teacherChips` prop (DB-first — courses.owner_user_id →
 * approved teacher_profiles, resolved by the page via
 * lib/home/source.ts's getCourseTeacherChips, static registry included as
 * its fallback), so a DB-authored course credits its REAL teacher in the
 * filter row, the cards, and the filtering itself. Without the prop (or for
 * a slug the chips don't know) it falls back to the same client-safe static
 * `getCourseTeacher()` lookup as before. Rendered only when 2+ distinct
 * teachers are present (a single-teacher marketplace has nothing to filter
 * by); the ?teacher= URL param and filtering logic work for any count.
 */
export function CatalogBrowser({
  courses,
  teacherChips,
  imageBySlug,
}: {
  courses: Course[];
  /** Server-resolved slug → { name, slug } attribution map (DB-first). */
  teacherChips?: Record<string, TeacherChip>;
  /** Server-resolved slug → face-photo URL (courseMainImage is fs-bound,
   *  so the server page passes resolved URLs down). */
  imageBySlug?: Record<string, string>;
}) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | null>) =>
    router.replace(
      pathname + mergeParams(new URLSearchParams(sp.toString()), patch),
      { scroll: false },
    );

  const rawCategory = get('cat');
  const category: CourseCategory | 'all' = (
    COURSE_CATEGORIES as string[]
  ).includes(rawCategory)
    ? (rawCategory as CourseCategory)
    : 'all';

  const rawSort = get('sort');
  const sort: SortKey = SORTS.includes(rawSort as SortKey)
    ? (rawSort as SortKey)
    : DEFAULT_SORT;

  // One resolution rule for every use below (filter row, filtering, cards):
  // the server-resolved chip first, the static registry as fallback.
  const chipFor = useCallback(
    (courseSlug: string): TeacherChip | null => {
      const fromServer = teacherChips?.[courseSlug];
      if (fromServer) return fromServer;
      const staticTeacher = getCourseTeacher(courseSlug);
      return staticTeacher
        ? { name: staticTeacher.displayName, slug: staticTeacher.slug }
        : null;
    },
    [teacherChips],
  );

  // Teacher chips: distinct (slug, displayName) pairs among the courses in
  // view, in first-seen order — stable across renders since `courses` is a
  // stable prop reference for the lifetime of one /formations visit.
  const teacherEntries = useMemo(() => {
    const bySlug = new Map<string, string>();
    for (const c of courses) {
      const teacher = chipFor(c.slug);
      if (teacher && !bySlug.has(teacher.slug)) bySlug.set(teacher.slug, teacher.name);
    }
    return [...bySlug.entries()];
  }, [courses, chipFor]);

  const rawTeacher = get('teacher');
  const teacherFilter: string | 'all' = teacherEntries.some(([s]) => s === rawTeacher)
    ? rawTeacher
    : 'all';

  // Clears the flash-guard flag (see PENDING_FILTERS_SCRIPT in the page)
  // once mounted: by the time this effect runs, `category`/`sort`/`query`
  // above have already been derived from the real searchParams for this
  // render, so the grid below is already correct — safe to reveal it.
  // Mount-only: later filter interactions never re-set the flag.
  useEffect(() => {
    document.getElementById('formations-catalog')?.removeAttribute('data-pending-filters');
  }, []);

  const [query, setQuery] = useState(() => get('q'));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => {
      // Build the next URL from the LIVE window.location.search, not the
      // `sp`/`get` captured when this effect was scheduled: an immediate
      // chip/sort push during the 250ms window updates the URL (and
      // re-renders with fresh `sp`), but this timeout's closure still
      // holds the stale one. Merging onto stale params here would revert
      // that interim change. Reading location.search fresh avoids it.
      const live = new URLSearchParams(window.location.search);
      if (query !== (live.get('q') ?? '')) {
        router.replace(pathname + mergeParams(live, { q: query || null }), {
          scroll: false,
        });
      }
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const needle = useMemo(() => normalize(query.trim()), [query]);

  const filtered = useMemo(() => {
    const list = courses.filter(
      (c) =>
        (category === 'all' || c.category === category) &&
        (teacherFilter === 'all' || chipFor(c.slug)?.slug === teacherFilter) &&
        matchesQuery(c, needle),
    );
    if (sort === 'priceAsc') return [...list].sort((a, b) => a.priceUsd - b.priceUsd);
    if (sort === 'priceDesc') return [...list].sort((a, b) => b.priceUsd - a.priceUsd);
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    return [...list].sort((a, b) =>
      collator.compare(
        locale === 'ht' ? a.title_ht : a.title_fr,
        locale === 'ht' ? b.title_ht : b.title_fr,
      ),
    );
  }, [courses, category, teacherFilter, needle, sort, locale, chipFor]);

  const hasFilters = !!get('q') || !!get('cat') || !!get('sort') || !!get('teacher');

  const reset = () => {
    setQuery('');
    router.replace(pathname, { scroll: false });
  };

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-paper-light p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('toolbar.searchPlaceholder')}
              aria-label={t('toolbar.searchLabel')}
              className={cn(
                'w-full rounded-lg border border-ink/15 bg-paper py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors motion-reduce:transition-none',
                focusRing,
              )}
            />
          </div>
          <select
            value={sort}
            onChange={(e) =>
              push({ sort: e.target.value === DEFAULT_SORT ? null : e.target.value })
            }
            aria-label={t('toolbar.sortLabel')}
            className={cn(
              'w-full cursor-pointer rounded-lg border border-ink/15 bg-paper px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-ink outline-none transition-colors motion-reduce:transition-none sm:w-auto',
              focusRing,
            )}
          >
            <option value="priceAsc">{t('toolbar.sort.priceAsc')}</option>
            <option value="priceDesc">{t('toolbar.sort.priceDesc')}</option>
            <option value="az">{t('toolbar.sort.az')}</option>
          </select>
        </div>

        <div
          role="group"
          aria-label={t('toolbar.categoryLabel')}
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            onClick={() => push({ cat: null })}
            aria-pressed={category === 'all'}
            className={cn(
              'rounded-full border px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors motion-reduce:transition-none',
              focusRing,
              category === 'all'
                ? 'border-ink bg-ink text-paper-light'
                : 'border-ink/20 text-ink/65 hover:border-ink/40',
            )}
          >
            {t('categories.all')}
          </button>
          {COURSE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => push({ cat: category === cat ? null : cat })}
              aria-pressed={category === cat}
              className={cn(
                'rounded-full border px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors motion-reduce:transition-none',
                focusRing,
                category === cat
                  ? 'border-ochre bg-ochre/15 text-ochre'
                  : 'border-ink/20 text-ink/65 hover:border-ink/40',
              )}
            >
              {t(`categories.${cat}`)}
            </button>
          ))}
        </div>

        {/* Teacher filter — subtle by design: only shown once there's an
            actual choice to make (2+ teachers among the courses in view). */}
        {teacherEntries.length > 1 && (
          <div
            role="group"
            aria-label={t('toolbar.teacherLabel')}
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              onClick={() => push({ teacher: null })}
              aria-pressed={teacherFilter === 'all'}
              className={cn(
                'rounded-full border px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors motion-reduce:transition-none',
                focusRing,
                teacherFilter === 'all'
                  ? 'border-ink bg-ink text-paper-light'
                  : 'border-ink/20 text-ink/65 hover:border-ink/40',
              )}
            >
              {t('toolbar.teacherAll')}
            </button>
            {teacherEntries.map(([slug, name]) => (
              <button
                key={slug}
                type="button"
                onClick={() => push({ teacher: teacherFilter === slug ? null : slug })}
                aria-pressed={teacherFilter === slug}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors motion-reduce:transition-none',
                  focusRing,
                  teacherFilter === slug
                    ? 'border-teal bg-teal/15 text-teal'
                    : 'border-ink/20 text-ink/65 hover:border-ink/40',
                )}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* results count + reset */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p
          aria-live="polite"
          className="font-mono text-xs uppercase tracking-wide text-ink/50"
        >
          {t('toolbar.resultsCount', { count: filtered.length })}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className={cn(
              'inline-flex items-center gap-1 rounded font-mono text-xs text-ink/55 underline decoration-ink/30 underline-offset-2 transition-colors hover:text-ochre',
              focusRing,
            )}
          >
            <IconX size={13} /> {t('reset')}
          </button>
        )}
      </div>

      {/* grid or empty state */}
      {filtered.length > 0 ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <Reveal key={c.code} delay={(i % 3) * 60}>
              <CourseCatalogCard course={c} teacher={chipFor(c.slug)} imageSrc={imageBySlug?.[c.slug]} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-ink/20 bg-paper-light/60 p-10 text-center">
          <p className="font-display text-xl font-bold text-ink">
            {needle ? t('empty.titleQuery', { query }) : t('empty.titleFilters')}
          </p>
          <p className="mt-2 text-sm text-graphite/70">{t('empty.subtitle')}</p>
          <button
            type="button"
            onClick={reset}
            className={cn(
              'mt-5 inline-flex items-center gap-1.5 rounded-lg border border-ink/20 px-4 py-2 font-mono text-xs uppercase tracking-wide text-ink transition-colors hover:border-ochre hover:text-ochre',
              focusRing,
            )}
          >
            <IconX size={13} /> {t('reset')}
          </button>
        </div>
      )}
    </div>
  );
}
