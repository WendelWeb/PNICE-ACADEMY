import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/email/layout';
import { getPublishedCourses } from '@/lib/courses/source';
import { getApprovedTeacherSlugs } from '@/lib/teacher/public';
import { teachers } from '@/data/teachers';

/** Static, content-bearing routes every locale carries (Stage 8). */
const STATIC_PATHS = [
  '',
  'formations',
  'pri',
  'apropos',
  'fak',
  'kontak',
  'enseigner',
  'legal/cgu',
  'legal/confidentialite',
  'legal/remboursement',
];

/**
 * sitemap.xml (Stage 8 — launch hygiene): home, the static marketing routes,
 * every PUBLISHED course (`getPublishedCourses` — the same public read the
 * catalogue itself uses, so a draft/pending/rejected course never leaks
 * into search), and every teacher with a live public `/prof/[slug]` page
 * (the static registry PLUS every approved `teacher_profiles.slug`, same
 * union `/prof/[slug]`'s own `generateStaticParams` builds) — one entry set
 * per locale, since every real route is locale-prefixed.
 *
 * GATED + NEVER-THROW throughout (both reads mirror their own module's
 * documented fallback): no DATABASE_URL simply means fewer dynamic entries,
 * never a broken build.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [courses, dbTeacherSlugs] = await Promise.all([
    getPublishedCourses(),
    getApprovedTeacherSlugs(),
  ]);

  const staticSlugs = teachers.map((t) => t.slug);
  const teacherSlugs = [...staticSlugs, ...dbTeacherSlugs.filter((s) => !staticSlugs.includes(s))];

  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    for (const path of STATIC_PATHS) {
      entries.push({
        url: `${SITE_URL}/${locale}${path ? `/${path}` : ''}`,
        lastModified: now,
      });
    }
    for (const course of courses) {
      entries.push({ url: `${SITE_URL}/${locale}/formations/${course.slug}`, lastModified: now });
    }
    for (const slug of teacherSlugs) {
      entries.push({ url: `${SITE_URL}/${locale}/prof/${slug}`, lastModified: now });
    }
  }

  return entries;
}
