/**
 * Unit tests for lib/reviews/reviews.ts (Task C3-T6) — the pure
 * weighted-teacher-rating math (`weightedAverage`), the star-clamp helper
 * (`clampStars`), and the gated fallback (no DATABASE_URL ⇒ null/0/[]/empty
 * set, never throws). No live DB is touched: this test environment has no
 * DATABASE_URL set (vitest.config.ts doesn't load .env.local — see
 * lib/courses/source.test.ts's / lib/teacher/profile.test.ts's headers for
 * the same reasoning), so every exported read function runs its fallback
 * path.
 */
import { describe, it, expect } from 'vitest';
import {
  weightedAverage,
  clampStars,
  getCourseRating,
  getCourseReviews,
  getMyReview,
  getTeacherRating,
  getReviewById,
  getReportedReviewIds,
  listReviewsForAdmin,
  type CourseRatingStat,
} from './reviews';

describe('weightedAverage — the ONE place a teacher rating is combined across courses', () => {
  it('returns null/0 for no courses at all', () => {
    expect(weightedAverage([])).toEqual({ avg: null, count: 0 });
  });

  it('a single course just passes its own avg/count through', () => {
    expect(weightedAverage([{ avg: 4.5, count: 10 }])).toEqual({ avg: 4.5, count: 10 });
  });

  it('weights by review count — NOT a plain average of per-course averages', () => {
    // Course A: 5★ but only 2 reviews. Course B: 4★ but 200 reviews.
    // A plain average-of-averages would give (5 + 4) / 2 = 4.5 — wrong: it
    // would let a 2-review course outweigh a 200-review one. The correct,
    // review-count-weighted result should sit much closer to 4 (course B
    // dominates), which is exactly the pooled average of every individual
    // review: (5*2 + 4*200) / 202 = 810/202 ≈ 4.0099.
    const stats: CourseRatingStat[] = [
      { avg: 5, count: 2 },
      { avg: 4, count: 200 },
    ];
    const result = weightedAverage(stats);
    expect(result.count).toBe(202);
    expect(result.avg).toBeCloseTo(810 / 202, 6);
    expect(result.avg!).toBeLessThan(4.5); // proves it's NOT the naive average-of-averages
  });

  it('a course with 0 reviews contributes nothing (no div-by-zero, no skew)', () => {
    const stats: CourseRatingStat[] = [
      { avg: 4, count: 10 },
      { avg: 0, count: 0 },
    ];
    expect(weightedAverage(stats)).toEqual({ avg: 4, count: 10 });
  });

  it('is equivalent to pooling every individual review (sanity cross-check)', () => {
    // 3 courses' worth of raw stars, grouped, should weighted-average to the
    // exact same figure as flattening every star into one array and averaging.
    const groups = [
      [5, 5, 4], // course A
      [3, 2], // course B
      [4, 4, 4, 5], // course C
    ];
    const stats: CourseRatingStat[] = groups.map((g) => ({
      avg: g.reduce((a, b) => a + b, 0) / g.length,
      count: g.length,
    }));
    const flat = groups.flat();
    const flatAvg = flat.reduce((a, b) => a + b, 0) / flat.length;
    const result = weightedAverage(stats);
    expect(result.count).toBe(flat.length);
    expect(result.avg).toBeCloseTo(flatAvg, 10);
  });
});

describe('clampStars — defense-in-depth star validation', () => {
  it('accepts integers 1..5 unchanged', () => {
    expect(clampStars(1)).toBe(1);
    expect(clampStars(3)).toBe(3);
    expect(clampStars(5)).toBe(5);
  });

  it('rounds a fractional value to the nearest integer', () => {
    expect(clampStars(4.4)).toBe(4);
    expect(clampStars(4.6)).toBe(5);
  });

  it('rejects 0, negative, and > 5', () => {
    expect(clampStars(0)).toBeNull();
    expect(clampStars(-1)).toBeNull();
    expect(clampStars(6)).toBeNull();
    expect(clampStars(100)).toBeNull();
  });

  it('rejects NaN/Infinity', () => {
    expect(clampStars(NaN)).toBeNull();
    expect(clampStars(Infinity)).toBeNull();
  });
});

describe('reviews.ts gated reads — no DATABASE_URL ⇒ safe empty values, never throw', () => {
  it('getCourseRating falls back to { avg: null, count: 0 }', async () => {
    expect(await getCourseRating('any-slug')).toEqual({ avg: null, count: 0 });
  });

  it('getCourseReviews falls back to []', async () => {
    expect(await getCourseReviews('any-slug')).toEqual([]);
  });

  it('getMyReview falls back to null', async () => {
    expect(await getMyReview('user-1', 'any-slug')).toBeNull();
  });

  it('getTeacherRating falls back to { avg: null, count: 0 }', async () => {
    expect(await getTeacherRating('owner-1')).toEqual({ avg: null, count: 0 });
  });

  it('getReviewById falls back to null', async () => {
    expect(await getReviewById('review-1')).toBeNull();
  });

  it('listReviewsForAdmin falls back to []', async () => {
    expect(await listReviewsForAdmin()).toEqual([]);
  });

  it('getReportedReviewIds never throws even if the ticket read fails/is empty', async () => {
    const ids = await getReportedReviewIds();
    expect(ids).toBeInstanceOf(Set);
  });
});
