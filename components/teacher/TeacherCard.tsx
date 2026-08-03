import { getTranslations } from 'next-intl/server';
import { IconArrowRight, IconStarFilled } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { SmartImage } from '@/components/ui/SmartImage';
import { siteImageSrc } from '@/lib/courseImage';
import type { PublicTeacher } from '@/lib/teacher/public';

/**
 * One teacher's roster card (Stage 4 — extracted verbatim from
 * components/home/TeachersRail.tsx so the home rail and the `/prof` teacher
 * directory stay ONE design): registry doc number, photo (live `photoUrl`
 * when validated, branded placeholder otherwise), name, course count, a
 * rating ONLY when real reviews exist, a 2-line bio clamp, and the
 * view-profile foot. The whole card is a single `<Link>` to `/prof/[slug]`
 * — the same read that guarantees the page exists resolved the data.
 * Labels come from the `home.teachersRail` namespace (shared on purpose:
 * one vocabulary for "X fòmasyon" / "Wè pwofil la" everywhere).
 */
export async function TeacherCard({ teacher }: { teacher: PublicTeacher }) {
  const t = await getTranslations('home.teachersRail');
  const hasRating = teacher.rating.avg !== null && teacher.rating.count > 0;

  return (
    <Link
      href={`/prof/${teacher.slug}`}
      className="card-hover group flex h-full flex-col rounded-xl border border-ink/12 bg-paper-light p-5 outline-none transition-colors hover:border-ochre/40 focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/40">
        {teacher.docNo}
      </span>
      <span className="mt-3 flex items-center gap-4">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ink/15 bg-ink">
          {teacher.photoUrl ? (
            // An external, protocol-validated photo URL (same
            // reasoning as /prof/[slug]): plain <img>, no remote-
            // host config needed.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={teacher.photoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <SmartImage
              src={siteImageSrc(teacher.imageName)}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          )}
        </span>
        <span className="min-w-0">
          <span className="block font-display text-xl font-bold leading-tight text-ink">
            {teacher.displayName}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-ink/55">
            {t('courseCount', { count: teacher.courseCount })}
            {hasRating && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="text-ink/25">
                  ·
                </span>
                <IconStarFilled size={12} className="text-ochre" aria-hidden="true" />
                {t('rating', {
                  avg: teacher.rating.avg!.toFixed(1),
                  count: teacher.rating.count,
                })}
              </span>
            )}
          </span>
        </span>
      </span>
      <span className="mt-4 line-clamp-2 text-sm leading-relaxed text-graphite/75">
        {teacher.bio}
      </span>
      <span className="mt-auto flex items-center gap-1.5 pt-4 font-mono text-[11px] uppercase tracking-wide text-teal transition-colors group-hover:text-ochre">
        {t('viewProfile')}
        <IconArrowRight
          size={13}
          className="transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
