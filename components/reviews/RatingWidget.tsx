'use client';

/**
 * Client-side rate/edit widget for the course sales page (Task C3-T6).
 * DELIBERATELY the only personalized piece of formations/[slug]/page.tsx:
 * that page stays fully static (`generateStaticParams` + `revalidate = 300`,
 * see its own file header) by never calling `auth()` server-side — exactly
 * how `components/auth/AuthCta.tsx` already keeps the purchase CTA static
 * (Clerk state read client-side via `SignedIn`/`SignedOut`). This widget
 * follows the same idea but needs a DB read (enrollment + any existing
 * review), which Clerk's client hooks can't give it — so it calls the
 * read-only `getMyReviewStatusAction` RPC on mount instead of the page doing
 * it server-side for every visitor.
 *
 * Renders one of three states once loaded:
 *   - not enrolled (includes signed-out — no need to distinguish for this
 *     UI): a subtle "buy to rate" note.
 *   - enrolled, no review yet: the star picker + comment form.
 *   - enrolled, already rated: the same form pre-filled, editable (upsert).
 */
import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Stars } from './Stars';
import { buttonClasses } from '@/components/ui/Button';
import {
  getMyReviewStatusAction,
  submitReviewAction,
  type ReviewActionResult,
} from '@/lib/reviews/actions';
import { COMMENT_MAX_LENGTH } from '@/lib/reviews/reviews';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'not_enrolled' }
  | { phase: 'ready'; stars: number; comment: string; hadReview: boolean; reviewStatus?: 'published' | 'removed' };


export function RatingWidget({ courseSlug }: { courseSlug: string }) {
  const t = useTranslations('reviews.widget');
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyReviewStatusAction(courseSlug).then((res) => {
      if (cancelled) return;
      if (!res.enrolled) {
        setState({ phase: 'not_enrolled' });
        return;
      }
      setState({
        phase: 'ready',
        stars: res.myReview?.stars ?? 0,
        comment: res.myReview?.comment ?? '',
        hadReview: Boolean(res.myReview),
        reviewStatus: res.myReview?.status,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  function errorText(message?: string): string {
    if (!message) return t('errors.error');
    const key = `errors.${message}`;
    // next-intl throws on a missing key in dev; guard with a known-set check.
    const known = ['unauthorized', 'not_enrolled', 'invalid_stars', 'comment_too_long', 'db_required', 'review_removed', 'error'];
    return known.includes(message) ? t(key) : t('errors.error');
  }

  function submit() {
    if (state.phase !== 'ready' || state.stars < 1) return;
    const { stars, comment, reviewStatus } = state;
    startTransition(async () => {
      setFeedback(null);
      const res: ReviewActionResult = await submitReviewAction(courseSlug, stars, comment);
      if (res.ok) {
        setFeedback({ type: 'ok', text: t('submitted') });
        setState({ phase: 'ready', stars, comment, hadReview: true, reviewStatus });
        router.refresh();
      } else {
        setFeedback({ type: 'err', text: errorText(res.message) });
      }
    });
  }

  if (state.phase === 'loading') {
    return <div className="h-9 w-40 animate-pulse rounded bg-ink/[0.04]" aria-hidden="true" />;
  }

  if (state.phase === 'not_enrolled') {
    return <p className="font-mono text-xs italic text-ink/45">{t('notEnrolledNote')}</p>;
  }

  // If the learner's review was removed by admin, show notice instead of form.
  if (state.phase === 'ready' && state.reviewStatus === 'removed') {
    return (
      <div className="max-w-md rounded-xl border border-ink/12 bg-paper-light p-4">
        <p className="font-mono text-[11px] uppercase tracking-wide text-stampred">
          {t('reviewRemoved')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md rounded-xl border border-ink/12 bg-paper-light p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {state.hadReview ? t('editTitle') : t('rateTitle')}
      </p>
      <div className="mt-2">
        <Stars
          value={state.stars}
          size={24}
          interactive
          onChange={(n) => setState({ ...state, stars: n })}
        />
      </div>
      <textarea
        value={state.comment}
        onChange={(e) => setState({ ...state, comment: e.target.value })}
        maxLength={COMMENT_MAX_LENGTH}
        rows={3}
        placeholder={t('commentPlaceholder')}
        className="mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || state.stars < 1}
          onClick={submit}
          className={buttonClasses('dark', 'sm')}
        >
          {state.hadReview ? t('update') : t('submit')}
        </button>
        {feedback && (
          <p className={`font-mono text-[11px] ${feedback.type === 'ok' ? 'text-teal' : 'text-stampred'}`} role="status">
            {feedback.text}
          </p>
        )}
      </div>
    </div>
  );
}
