/**
 * lib/courses/nav-index.ts — the light course index behind the GLOBAL nav
 * search (owner: « partie recherche pas vraiment pro et évident » — a
 * marketplace's search lives in the header, on every page, not buried in a
 * toolbar on one route).
 *
 * Server-only: resolves images through lib/courseImage.ts (node:fs) and
 * teachers through the same DB-first chips the catalogue uses, then ships a
 * REDUCED Course shape (no lessons, no sales-page fields) to the client —
 * a page-weight budget of a few KB for a 9-course catalogue, embedded in
 * the layout HTML so suggestions are INSTANT (no per-keystroke endpoint).
 *
 * Cached via unstable_cache (2 min): the site layout renders on every
 * request (force-dynamic for the maintenance flag), and without this the
 * nav would re-read the whole courses+lessons tables per page view.
 */
import { unstable_cache } from 'next/cache';
import type { Course } from '@/data/courses';
import { getPublishedCourses } from '@/lib/courses/source';
import { getCourseTeacherChips } from '@/lib/home/source';
import { courseImageList } from '@/lib/courseImage';

export type NavIndexEntry = {
  /** Reduced Course — enough for lib/courses/search.ts scoring + display.
   *  `lessons` is deliberately empty (weight-1 field, not worth the bytes). */
  course: Course;
  /** First face photo, resolved server-side (fs-bound). */
  img: string | null;
  /** Teacher display name — a search for « dadlyn » must find her courses. */
  teacher: string | null;
};

async function buildNavSearchIndex(): Promise<NavIndexEntry[]> {
  const courses = await getPublishedCourses();
  const chips = await getCourseTeacherChips(courses.map((c) => c.slug));
  return courses.map((c) => ({
    course: {
      code: c.code,
      slug: c.slug,
      icon: c.icon,
      category: c.category,
      priceUsd: c.priceUsd,
      title_ht: c.title_ht,
      title_fr: c.title_fr,
      tagline_ht: c.tagline_ht,
      tagline_fr: c.tagline_fr,
      learn_ht: c.learn_ht,
      learn_fr: c.learn_fr,
      audience_ht: c.audience_ht,
      audience_fr: c.audience_fr,
      lessons: [],
      bilingual: c.bilingual,
      primary_locale: c.primary_locale,
      tags: c.tags,
    },
    img: courseImageList(c.images, c.code)[0] ?? null,
    teacher: chips[c.slug]?.name ?? null,
  }));
}

export const getNavSearchIndex = unstable_cache(buildNavSearchIndex, ['nav-search-index'], {
  revalidate: 120,
});
