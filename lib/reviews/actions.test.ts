/**
 * Unit tests for lib/reviews/actions.ts (Task C3-T6) — the env gate every
 * review action checks BEFORE calling `auth()`/touching `db` (mirrors
 * lib/teacher/studio-actions.test.ts's approach — see that file's header for
 * the same reasoning). No live DB/Clerk is touched: this test environment
 * has no DATABASE_URL set by default, so every action resolves its
 * `db_required` fallback immediately.
 *
 * This does NOT exercise the enrollment gate itself (`hasCourseAccess`,
 * lib/learner/access.ts) — that check needs a live DB + Clerk session to
 * reach, exactly like studio-actions.test.ts's ownership check. What IS
 * covered here is the gate ORDERING that makes the integrity gate
 * unbypassable: `submitReviewAction` returns `db_required` before it ever
 * calls `auth()` or `hasCourseAccess()`, so there is no code path where a
 * missing/misconfigured DB silently skips the enrollment check instead of
 * just refusing outright.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  submitReviewAction,
  reportReviewAction,
  removeReviewAction,
  getMyReviewStatusAction,
} from './actions';

describe('lib/reviews/actions.ts — env gate (no DATABASE_URL, never reaches Clerk/db)', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('submitReviewAction returns db_required before touching Clerk/db', async () => {
    delete process.env.DATABASE_URL;
    expect(await submitReviewAction('some-course', 5, 'Great course!')).toEqual({
      ok: false,
      message: 'db_required',
    });
  });

  it('submitReviewAction with an out-of-range rating still gates on db_required first', async () => {
    delete process.env.DATABASE_URL;
    // Even a client sending a bogus 99-star rating hits the DB gate before
    // validation — proves the gate is unconditionally first, not bypassable
    // by a malformed payload.
    expect(await submitReviewAction('some-course', 99)).toEqual({
      ok: false,
      message: 'db_required',
    });
  });

  it('reportReviewAction returns db_required before touching Clerk/db', async () => {
    delete process.env.DATABASE_URL;
    expect(await reportReviewAction('review-1')).toEqual({ ok: false, message: 'db_required' });
  });

  it('removeReviewAction returns db_required before touching Clerk/db', async () => {
    delete process.env.DATABASE_URL;
    expect(await removeReviewAction('review-1', 'inappropriate content')).toEqual({
      ok: false,
      message: 'db_required',
    });
  });

  it('getMyReviewStatusAction returns the neutral signed-out/not-enrolled shape', async () => {
    delete process.env.DATABASE_URL;
    expect(await getMyReviewStatusAction('some-course')).toEqual({
      signedIn: false,
      enrolled: false,
      myReview: null,
    });
  });

  it('removeReviewAction gates on db_required first, even with an otherwise-invalid (empty) reason', async () => {
    delete process.env.DATABASE_URL;
    // Proves the db gate is unconditionally first — an empty reason never
    // gets a chance to surface its own 'reason_required' message when the DB
    // isn't even configured (that check only runs once dbConfigured() passes).
    expect(await removeReviewAction('review-1', '   ')).toEqual({
      ok: false,
      message: 'db_required',
    });
  });
});
