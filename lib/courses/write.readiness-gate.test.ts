/**
 * Production hardening pass — `publishCourse`/`approveCourse`
 * (lib/courses/write.ts) used to check ONLY the status transition
 * ('draft'→published, 'pending_review'→published); `computeCourseReadiness`
 * was wired to nothing, so a course with zero lessons — or lessons with no
 * video at all — could go (or stay) live with nothing to actually watch.
 * This proves the new `assertCourseSellable` gate, DB-mocked:
 *  - a lesson missing `bunnyVideoId` refuses BOTH `publishCourse` and
 *    `approveCourse` with `{ ok: false, message: 'not_ready' }`, and neither
 *    writes anything (no status flip, no audit row);
 *  - a course with every lesson video'd proceeds exactly as before: the
 *    status transition still happens.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  selectQueue: [] as AnyRow[][],
  updates: [] as { set: AnyRow }[],
  inserts: [] as { values: AnyRow }[],
}));

vi.mock('@/db', async () => {
  const schema = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  const makeSelect = () => {
    const result = dbState.selectQueue.length > 0 ? (dbState.selectQueue.shift() as AnyRow[]) : [];
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.from = chain;
    b.where = chain;
    b.limit = chain;
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR);
    return b;
  };
  const makeUpdate = () => {
    const rec = { set: {} as AnyRow };
    dbState.updates.push(rec);
    const b: Record<string, unknown> = {};
    b.set = (s: AnyRow) => {
      rec.set = s;
      return b;
    };
    b.where = () => b;
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onF, onR);
    return b;
  };
  const makeInsert = () => {
    const rec = { values: {} as AnyRow };
    dbState.inserts.push(rec);
    const b: Record<string, unknown> = {};
    b.values = (v: AnyRow) => {
      rec.values = v;
      return b;
    };
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onF, onR);
    return b;
  };
  return {
    db: { select: () => makeSelect(), update: () => makeUpdate(), insert: () => makeInsert() },
    schema,
    isMissingColumnError: () => false,
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/resend', () => ({ sendEmail: vi.fn(async () => ({ sent: false, skipped: true })), emailConfigured: () => false }));
vi.mock('@/lib/bunny/upload', () => ({ deleteBunnyVideo: vi.fn(async () => undefined), bunnyUploadConfigured: () => false }));

import { publishCourse, approveCourse } from './write';
import type { AdminActor } from '@/lib/admin/data/types';

const ACTOR: AdminActor = { id: 'admin-1', name: 'Admin' };

const COURSE_ROW = (over: AnyRow = {}) => ({
  slug: 'kou-san-videyo',
  code: 'PA-99',
  status: 'draft',
  hasUnpublishedChanges: false,
  priceCents: 4900,
  promiseHt: 'Pwomès',
  promiseFr: 'Promesse',
  ...over,
});

const lessonRow = (over: AnyRow = {}) => ({
  id: 'lesson-1',
  courseSlug: 'kou-san-videyo',
  titleHt: 'Leson 1',
  titleFr: 'Leçon 1',
  bunnyVideoId: null,
  isPreview: false,
  index: 0,
  chapterId: null,
  ...over,
});

const ORIGINAL_DB = process.env.DATABASE_URL;

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.updates = [];
  dbState.inserts = [];
  process.env.DATABASE_URL = 'postgres://mock/mock';
});

afterAll(() => {
  if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB;
});

describe('publishCourse — the readiness gate (production hardening pass)', () => {
  it('refuses a course with a videoless lesson: not_ready, no write at all', async () => {
    dbState.selectQueue = [
      [{ status: 'draft' }], // status check
      [COURSE_ROW()], // selectCourseRowBySlug
      [lessonRow({ bunnyVideoId: null })], // lessons
      [], // chapters
    ];
    const res = await publishCourse('kou-san-videyo', ACTOR);
    expect(res).toEqual({ ok: false, message: 'not_ready' });
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
  });

  it('refuses a course with ZERO lessons: not_ready', async () => {
    dbState.selectQueue = [[{ status: 'draft' }], [COURSE_ROW()], [], []];
    const res = await publishCourse('kou-san-videyo', ACTOR);
    expect(res).toEqual({ ok: false, message: 'not_ready' });
    expect(dbState.updates).toHaveLength(0);
  });

  it('proceeds to publish once every lesson has a video (unchanged behavior)', async () => {
    dbState.selectQueue = [
      [{ status: 'draft' }],
      [COURSE_ROW()],
      [lessonRow({ id: 'l1', index: 0, bunnyVideoId: 'vid_1' }), lessonRow({ id: 'l2', index: 1, bunnyVideoId: 'vid_2' })],
      [],
    ];
    const res = await publishCourse('kou-san-videyo', ACTOR);
    expect(res).toEqual({ ok: true });
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set).toMatchObject({ status: 'published' });
  });

  it('still refuses the ORIGINAL status-transition guard first (unrelated to readiness)', async () => {
    dbState.selectQueue = [[{ status: 'published' }]]; // already published — invalid_status short-circuits before readiness is even read
    const res = await publishCourse('kou-san-videyo', ACTOR);
    expect(res).toEqual({ ok: false, message: 'invalid_status' });
    expect(dbState.updates).toHaveLength(0);
  });
});

describe('approveCourse — the SAME readiness gate on the moderation-queue path', () => {
  const APPROVE_CURRENT = { status: 'pending_review', ownerUserId: null, titleHt: 'Kou', titleFr: 'Cours' };

  it('refuses a course with a videoless lesson: not_ready, no write at all', async () => {
    dbState.selectQueue = [
      [APPROVE_CURRENT],
      [COURSE_ROW({ status: 'pending_review' })],
      [lessonRow({ bunnyVideoId: '' })],
      [],
    ];
    const res = await approveCourse('kou-san-videyo', ACTOR);
    expect(res).toEqual({ ok: false, message: 'not_ready' });
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.inserts).toHaveLength(0);
  });

  it('proceeds to approve once every lesson has a video (unchanged behavior)', async () => {
    dbState.selectQueue = [
      [APPROVE_CURRENT],
      [COURSE_ROW({ status: 'pending_review' })],
      [lessonRow({ id: 'l1', index: 0, bunnyVideoId: 'vid_1' })],
      [],
    ];
    const res = await approveCourse('kou-san-videyo', ACTOR);
    expect(res).toEqual({ ok: true });
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set).toMatchObject({ status: 'published' });
    // The audit-log insert still happens on a successful approve.
    expect(dbState.inserts.length).toBeGreaterThanOrEqual(1);
  });
});
