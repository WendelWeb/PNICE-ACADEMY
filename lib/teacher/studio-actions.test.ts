/**
 * Unit tests for lib/teacher/studio-actions.ts (Task C3-T4) — the env gate
 * every studio mutation checks BEFORE calling `auth()`/touching `db`
 * (mirrors lib/teacher/actions.ts's `applyAsTeacherAction` test — see that
 * file's header for the same reasoning). No live DB/Clerk is touched: this
 * test environment has no DATABASE_URL set by default, so every action
 * resolves its `db_required` fallback immediately.
 *
 * This does NOT exercise the ownership check itself (that needs a live DB
 * + Clerk session to reach) — it only proves the gate ordering that makes
 * every action safe to call pre-migration, matching the rest of the C3
 * write modules' test coverage.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  createMyCourseAction,
  updateMyCourseAction,
  submitMyCourseForReviewAction,
  unpublishMyCourseAction,
  addMyLessonAction,
  updateMyLessonAction,
  deleteMyLessonAction,
  moveMyLessonAction,
  validateMyBunnyVideoAction,
  setMyMainImageAction,
  addMySecondaryImageAction,
  removeMySecondaryImageAction,
  moveMySecondaryImageAction,
  requestWithdrawalAction,
} from './studio-actions';

describe('lib/teacher/studio-actions.ts — env gate (no DATABASE_URL, never reaches Clerk/db)', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('createMyCourseAction returns db_required', async () => {
    delete process.env.DATABASE_URL;
    expect(await createMyCourseAction({ title_ht: 'x', title_fr: 'x' })).toEqual({
      ok: false,
      message: 'db_required',
    });
  });

  it('updateMyCourseAction returns db_required', async () => {
    delete process.env.DATABASE_URL;
    expect(await updateMyCourseAction('slug', {})).toEqual({ ok: false, message: 'db_required' });
  });

  it('submitMyCourseForReviewAction returns db_required', async () => {
    delete process.env.DATABASE_URL;
    expect(await submitMyCourseForReviewAction('slug')).toEqual({ ok: false, message: 'db_required' });
  });

  it('unpublishMyCourseAction returns db_required', async () => {
    delete process.env.DATABASE_URL;
    expect(await unpublishMyCourseAction('slug')).toEqual({ ok: false, message: 'db_required' });
  });

  it('every lesson action returns db_required', async () => {
    delete process.env.DATABASE_URL;
    expect(await addMyLessonAction('slug')).toEqual({ ok: false, message: 'db_required' });
    expect(await updateMyLessonAction('slug', 'lesson-1', {})).toEqual({ ok: false, message: 'db_required' });
    expect(await deleteMyLessonAction('slug', 'lesson-1')).toEqual({ ok: false, message: 'db_required' });
    expect(await moveMyLessonAction('slug', 'lesson-1', 'up')).toEqual({ ok: false, message: 'db_required' });
    expect(await validateMyBunnyVideoAction('abc')).toEqual({ ok: false, message: 'db_required' });
  });

  it('every image action returns db_required', async () => {
    delete process.env.DATABASE_URL;
    expect(await setMyMainImageAction('slug', 'https://x')).toEqual({ ok: false, message: 'db_required' });
    expect(await addMySecondaryImageAction('slug', 'https://x', 'alt')).toEqual({ ok: false, message: 'db_required' });
    expect(await removeMySecondaryImageAction('slug', 'img-1')).toEqual({ ok: false, message: 'db_required' });
    expect(await moveMySecondaryImageAction('slug', 'img-1', 'up')).toEqual({ ok: false, message: 'db_required' });
  });

  it('requestWithdrawalAction returns db_required', async () => {
    delete process.env.DATABASE_URL;
    expect(await requestWithdrawalAction(5000)).toEqual({ ok: false, message: 'db_required' });
  });
});
