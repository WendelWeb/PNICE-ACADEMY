import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/ui/Reveal';
import { getCourseRating, getCourseReviews } from '@/lib/reviews/reviews';
import { RatingSummary } from './RatingSummary';
import { RatingWidget } from './RatingWidget';
import { ReportButton } from './ReportButton';
import { Stars } from './Stars';

/**
 * The course sales page's rating + reviews block (Task C3-T6): the rating
 * summary, the recent published reviews, and the rate/edit widget. A server
 * component so the rating/review LIST stays part of the page's static
 * render (`generateStaticParams` + `revalidate = 300` on
 * formations/[slug]/page.tsx) — only `RatingWidget` inside it is a client
 * component that personalizes itself (see that file's header).
 */
export async function ReviewsSection({ courseSlug }: { courseSlug: string }) {
  const t = await getTranslations('reviews');
  const [rating, reviews] = await Promise.all([getCourseRating(courseSlug), getCourseReviews(courseSlug, 8)]);

  return (
    <Reveal className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-ink">{t('title')}</h2>
        {rating.avg !== null && (
          <RatingSummary
            avg={rating.avg}
            countLabel={t('countLabel', { count: rating.count })}
            emptyLabel=""
            size={18}
          />
        )}
      </div>

      <div className="mt-6">
        <RatingWidget courseSlug={courseSlug} />
      </div>

      {reviews.length === 0 ? (
        <p className="mt-6 font-mono text-xs text-ink/45">{t('empty')}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-ink/10 bg-paper-light p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Stars value={r.stars} size={14} />
                  <span className="font-mono text-[11px] text-ink/60">
                    {r.reviewerName || t('reviewerFallback')}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-ink/40">{r.createdAt.slice(0, 10)}</span>
              </div>
              {r.comment && <p className="mt-2 text-sm leading-relaxed text-graphite">{r.comment}</p>}
              <div className="mt-2">
                <ReportButton reviewId={r.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Reveal>
  );
}
