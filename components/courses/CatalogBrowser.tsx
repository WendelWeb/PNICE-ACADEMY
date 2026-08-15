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
import { tokenizeQuery, courseSearchScore } from '@/lib/courses/search';
import type { TeacherChip } from '@/lib/home/source';
import type { RatingSummary } from '@/lib/reviews/reviews';

/**
 * 'rated' first and DEFAULT (conversion audit: price-ascending as default
 * sorted the catalogue cheapest-first — a bargain-bin shelf, not a
 * marketplace). With zero reviews everywhere it degrades to catalogue order
 * (stable sort), which is exactly the curated order. When the buyer TYPES a
 * query while on the default sort, results order by RELEVANCE instead — the
 * behaviour every search box on earth has trained people to expect.
 */
type SortKey = 'rated' | 'new' | 'priceAsc' | 'priceDesc' | 'az';
const SORTS: SortKey[] = ['rated', 'new', 'priceAsc', 'priceDesc', 'az'];
const DEFAULT_SORT: SortKey = 'rated';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

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
  ratingsBySlug,
}: {
  courses: Course[];
  /** Server-resolved slug → { name, slug } attribution map (DB-first). */
  teacherChips?: Record<string, TeacherChip>;
  /** Server-resolved slug → face-photo URL (courseMainImage is fs-bound,
   *  so the server page passes resolved URLs down). */
  imageBySlug?: Record<string, string[]>;
  /** Server-resolved slug → real review summary — the card only renders a
   *  star row when count > 0 (no reviews, no claim). */
  ratingsBySlug?: Record<string, RatingSummary>;
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
  // An EXPLICIT valid ?sort= param is user intent and always wins; only its
  // absence lets a typed query switch to relevance ordering (adversarial
  // review: comparing the resolved value made « rated + query » unreachable
  // and the select claimed an order it wasn't applying).
  const hasExplicitSort = SORTS.includes(rawSort as SortKey);
  const sort: SortKey = hasExplicitSort ? (rawSort as SortKey) : DEFAULT_SORT;

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

  // Tag filter (?tag=) — free teacher-chosen words (migration 0022). The
  // chip row only renders when the catalogue actually carries tags.
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of courses) for (const tag of c.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [courses]);
  const rawTag = get('tag');
  const tagFilter: string | 'all' = allTags.some(([tag]) => tag === rawTag) ? rawTag : 'all';

  const tokens = useMemo(() => tokenizeQuery(query), [query]);

  const filtered = useMemo(() => {
    const scores = new Map<string, number>();
    const list = courses.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (teacherFilter !== 'all' && chipFor(c.slug)?.slug !== teacherFilter) return false;
      if (tagFilter !== 'all' && !(c.tags ?? []).includes(tagFilter)) return false;
      if (tokens.length === 0) return true;
      const score = courseSearchScore(c, tokens, chipFor(c.slug)?.name);
      scores.set(c.slug, score);
      return score > 0;
    });
    // Typed query with NO explicit sort param ⇒ order by RELEVANCE.
    if (tokens.length > 0 && !hasExplicitSort) {
      return [...list].sort((a, b) => (scores.get(b.slug) ?? 0) - (scores.get(a.slug) ?? 0));
    }
    if (sort === 'rated') {
      // Real reviews first (best average, then most-reviewed); the stable
      // sort leaves the no-review tail in curated catalogue order.
      return [...list].sort((a, b) => {
        const ra = ratingsBySlug?.[a.slug];
        const rb = ratingsBySlug?.[b.slug];
        return (rb?.avg ?? -1) - (ra?.avg ?? -1) || (rb?.count ?? 0) - (ra?.count ?? 0);
      });
    }
    if (sort === 'new') {
      // DB-published courses by recency; static seeds (no published_at) keep
      // their curated order at the tail.
      return [...list].sort(
        (a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''),
      );
    }
    if (sort === 'priceAsc') return [...list].sort((a, b) => a.priceUsd - b.priceUsd);
    if (sort === 'priceDesc') return [...list].sort((a, b) => b.priceUsd - a.priceUsd);
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    return [...list].sort((a, b) =>
      collator.compare(
        locale === 'ht' ? a.title_ht : a.title_fr,
        locale === 'ht' ? b.title_ht : b.title_fr,
      ),
    );
  }, [courses, category, teacherFilter, tagFilter, tokens, sort, hasExplicitSort, locale, chipFor, ratingsBySlug]);

  // FACETED chip counts (adversarial review): a chip's number must be what
  // tapping it would actually show — so each dimension's counts respect
  // every OTHER active filter (standard faceting), never the raw catalogue.
  const facetBase = useCallback(
    (skip: 'cat' | 'tag') =>
      courses.filter(
        (c) =>
          (skip === 'cat' || category === 'all' || c.category === category) &&
          (teacherFilter === 'all' || chipFor(c.slug)?.slug === teacherFilter) &&
          (skip === 'tag' || tagFilter === 'all' || (c.tags ?? []).includes(tagFilter)) &&
          (tokens.length === 0 || courseSearchScore(c, tokens, chipFor(c.slug)?.name ?? undefined) > 0),
      ),
    [courses, category, teacherFilter, tagFilter, tokens, chipFor],
  );
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of facetBase('cat')) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, [facetBase]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of facetBase('tag')) for (const tag of c.tags ?? []) m.set(tag, (m.get(tag) ?? 0) + 1);
    return m;
  }, [facetBase]);

  const hasFilters =
    !!get('q') || !!get('cat') || !!get('sort') || !!get('teacher') || !!get('tag');

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
                'w-full rounded-lg border border-ink/15 bg-paper py-2.5 pl-9 pr-9 text-sm text-ink outline-none transition-colors motion-reduce:transition-none',
                focusRing,
              )}
            />
            {/* One-tap clear — typed queries need an exit as obvious as the
                entry (type=search's native × is inconsistent across mobile
                browsers, so the control is ours). */}
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('reset')}
                className={cn(
                  'absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink/45 transition-colors hover:bg-ink/10 hover:text-ink',
                  focusRing,
                )}
              >
                <IconX size={14} />
              </button>
            )}
          </div>
          <select
            value={tokens.length > 0 && !hasExplicitSort ? 'relevance' : sort}
            onChange={(e) => {
              const v = e.target.value;
              // During a search, an explicit choice must SET the param (even
              // for the default) — absence is what means « relevance ».
              push({
                sort: v === 'relevance' || (v === DEFAULT_SORT && tokens.length === 0) ? null : v,
              });
            }}
            aria-label={t('toolbar.sortLabel')}
            className={cn(
              'w-full cursor-pointer rounded-lg border border-ink/15 bg-paper px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-ink outline-none transition-colors motion-reduce:transition-none sm:w-auto',
              focusRing,
            )}
          >
            {tokens.length > 0 && (
              <option value="relevance">{t('toolbar.sort.relevance')}</option>
            )}
            <option value="rated">{t('toolbar.sort.rated')}</option>
            <option value="new">{t('toolbar.sort.new')}</option>
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
          {COURSE_CATEGORIES.map((cat) => {
            // Count on each shelf — the number is what tapping the chip
            // would actually show (faceted against the other live filters).
            const count = categoryCounts.get(cat) ?? 0;
            return (
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
                <span className={cn('ml-1.5', category === cat ? 'text-ochre/70' : 'text-ink/40')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tag filter — free teacher-chosen words (0022). Appears only once
            the catalogue actually carries tags; most-used first. */}
        {allTags.length > 0 && (
          <div role="group" aria-label={t('toolbar.tagLabel')} className="flex flex-wrap gap-2">
            {allTags.slice(0, 12).map(([tag]) => {
              const count = tagCounts.get(tag) ?? 0;
              return (
              <button
                key={tag}
                type="button"
                onClick={() => push({ tag: tagFilter === tag ? null : tag })}
                aria-pressed={tagFilter === tag}
                className={cn(
                  'rounded-full border px-3 py-1 font-mono text-[11px] transition-colors motion-reduce:transition-none',
                  focusRing,
                  tagFilter === tag
                    ? 'border-teal bg-teal/15 text-teal'
                    : 'border-ink/15 text-ink/55 hover:border-ink/35',
                )}
              >
                #{tag}
                <span className="ml-1 text-ink/35">{count}</span>
              </button>
              );
            })}
          </div>
        )}

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
              <CourseCatalogCard
                course={c}
                teacher={chipFor(c.slug)}
                imageSrcs={imageBySlug?.[c.slug]}
                rating={ratingsBySlug?.[c.slug]}
              />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <div className="rounded-2xl border border-dashed border-ink/20 bg-paper-light/60 p-10 text-center">
            <p className="font-display text-xl font-bold text-ink">
              {tokens.length > 0 ? t('empty.titleQuery', { query }) : t('empty.titleFilters')}
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
          {/* A dead end sells nothing — a zero-result search still shows
              three real courses to keep the browse alive (Udemy does the
              same under « no results »). */}
          <p className="mt-8 font-mono text-xs uppercase tracking-wide text-ink/50">
            {t('empty.suggestions')}
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 3).map((c) => (
              <CourseCatalogCard
                key={c.code}
                course={c}
                teacher={chipFor(c.slug)}
                imageSrcs={imageBySlug?.[c.slug]}
                rating={ratingsBySlug?.[c.slug]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
