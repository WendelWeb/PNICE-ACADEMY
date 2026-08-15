import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { CatalogBrowser } from '@/components/courses/CatalogBrowser';
import { courseImageList } from '@/lib/courseImage';
import { CourseCatalogCard } from '@/components/courses/CourseCatalogCard';
import { getPublishedCourses } from '@/lib/courses/source';
import { getCourseTeacherChips } from '@/lib/home/source';
import { getCourseRatings } from '@/lib/reviews/reviews';

export const metadata: Metadata = {
  title: 'Fòmasyon — PNICE Academy',
};

// Course data is DB-backed (Task C2-T3, gated + fallback to static data) —
// revalidate periodically instead of staying purely static.
export const revalidate = 300;

/**
 * Guards against a wrong-content flash on shared, filtered deep links
 * (e.g. /ht/formations?cat=lajan). The route stays static (see the
 * Suspense fallback below) so the common unfiltered visit paints
 * instantly; but the static HTML is always the *unfiltered* catalogue,
 * which is momentarily wrong for a filtered URL until CatalogBrowser
 * mounts and swaps in the real, filtered grid.
 *
 * This script is the first child of #formations-catalog, so
 * `document.currentScript.parentElement` resolves synchronously (no
 * need to wait for the rest of the div to parse) and runs before the
 * fallback/CatalogBrowser content beneath it is painted. If the URL
 * carries q/cat/sort/teacher, it flips a data attribute the CSS in
 * globals.css reacts to, hiding the (possibly wrong) grid and showing a
 * neutral skeleton instead; CatalogBrowser clears the attribute once it has
 * mounted with the correct, already-filtered content. Unfiltered
 * visits never match the regex, so nothing is set and the static HTML
 * is unchanged. `teacher` (Task C3-T7's catalog filter) is included for the
 * exact same reason q/cat/sort are — a shared deep link like
 * ?teacher=pnice-academy must not flash the full unfiltered grid either.
 */
const PENDING_FILTERS_SCRIPT = `(function(){
  if (/[?&](q|cat|sort|teacher|tag)=/.test(location.search)) {
    document.currentScript.parentElement.dataset.pendingFilters = '1';
  }
})();`;

export default async function FormationsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('catalog');
  const courses = await getPublishedCourses();
  // Stage 4 — real attribution on every catalogue card: DB-first teacher
  // chips (courses.owner_user_id → approved teacher_profiles), static
  // registry as fallback — the same batch read the home grid uses. Gated +
  // never-throws; no DB ⇒ exactly the static mapping as before.
  const teacherChips = await getCourseTeacherChips(courses.map((c) => c.slug));
  // Course face photos, resolved HERE because lib/courseImage.ts reads the
  // filesystem (server-only) and the cards are client components.
  const imageBySlug = Object.fromEntries(
    courses.map((c) => [c.slug, courseImageList(c.images, c.code)]),
  );
  // Real ratings on the CATALOGUE cards (conversion audit #1 — the reviews
  // existed but only the home grid showed them; the page where buyers
  // actually compare courses showed none). One batch read, gated +
  // never-throws; a course with zero reviews renders no star row — no
  // reviews, no claim.
  const ratings = await getCourseRatings(courses.map((c) => c.slug));

  return (
    <Section>
      <Container>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>{t('eyebrow', { count: courses.length })}</Eyebrow>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
              {t('title')}
            </h1>
            <p className="mt-3 max-w-xl text-graphite">{t('subtitle', { count: courses.length })}</p>
          </div>
          <Sceau size="md" print rotate={-6} className="shrink-0">
            <span className="font-display text-3xl font-black leading-none">
              {courses.length}
            </span>
            <span className="mt-0.5 text-[9px] tracking-[0.18em]">manifès</span>
          </Sceau>
        </div>

        {/* The toolbar reads/writes ?q=&cat=&sort= via useSearchParams, which
            requires a Suspense boundary. The fallback is the full, unfiltered,
            server-rendered grid — real course cards, crawlable and CLS-free
            for the common unfiltered visit. For a filtered deep link, the
            inline script + skeleton below (see PENDING_FILTERS_SCRIPT doc
            comment) hide that fallback's wrong content until CatalogBrowser
            mounts with the real, filtered grid. */}
        <div className="mt-12" id="formations-catalog">
          <script
            dangerouslySetInnerHTML={{ __html: PENDING_FILTERS_SCRIPT }}
          />
          <div
            aria-hidden="true"
            className="formations-catalog-skeleton grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="formations-skeleton-card h-64 rounded-xl border border-ink/12 bg-paper-light/60"
              />
            ))}
          </div>
          <div className="formations-catalog-content">
            <Suspense
              fallback={
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.map((c) => (
                    <CourseCatalogCard
                      key={c.code}
                      course={c}
                      teacher={teacherChips[c.slug]}
                      rating={ratings[c.slug]}
                      imageSrcs={imageBySlug[c.slug]}
                    />
                  ))}
                </div>
              }
            >
              <CatalogBrowser
                courses={courses}
                teacherChips={teacherChips}
                imageBySlug={imageBySlug}
                ratingsBySlug={ratings}
              />
            </Suspense>
          </div>
        </div>
      </Container>
    </Section>
  );
}
