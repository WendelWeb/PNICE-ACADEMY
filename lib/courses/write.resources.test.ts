/**
 * Stage 4 (documents/ressources) — unit tests for the resource write path.
 *
 * Resources were the ONE bilingual exception left after Task: course/lesson/
 * chapter-language: `validateResource` hard-requires BOTH labels, so a
 * monolingual kreyòl course was still forced to type a French title for
 * every link/document. The cure is `prepareResourcesForWrite` (mirror the
 * primary label into the other side when the course is monolingual, THEN
 * run the unchanged strict validation) — the ONE shared path BOTH
 * `updateCourse` and `updateLesson` traverse when a patch carries
 * `resources`.
 *
 * Two layers here, in the same file:
 *  1. the pure function (`prepareResourcesForWrite`) — mono mirrors,
 *     bilingual still rejects, normalization;
 *  2. TRAVERSAL of both `updateCourse` and `updateLesson`'s resource paths,
 *     with `@/db` mocked (this repo's first DB-mocked suite — kept minimal:
 *     a queue of select results + a recorder of update `set` objects), so
 *     the wiring is proven too: the server-resolved `bilingual`/
 *     `primaryLocale` reach the mirror, the mirrored+normalized rows reach
 *     the DB `set`, and a bilingual course's invalid patch is rejected
 *     BEFORE any write.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type AnyRow = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  /** Rows returned by each successive `db.select()...` chain, in call order. */
  selectQueue: [] as AnyRow[][],
  /** Every `db.update().set(...)` captured, in call order. */
  updates: [] as { set: AnyRow }[],
  /** Rows returned by each successive update chain's `.returning()`/await. */
  updateReturning: [] as AnyRow[][],
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
    b.orderBy = chain;
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(result).then(onF, onR);
    return b;
  };
  const makeUpdate = () => {
    const rec = { set: {} as AnyRow };
    dbState.updates.push(rec);
    const result = dbState.updateReturning.length > 0 ? (dbState.updateReturning.shift() as AnyRow[]) : [];
    const b: Record<string, unknown> = {};
    b.set = (s: AnyRow) => {
      rec.set = s;
      return b;
    };
    b.where = () => b;
    b.returning = () => Promise.resolve(result);
    b.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(result).then(onF, onR);
    return b;
  };
  return {
    db: {
      select: () => makeSelect(),
      update: () => makeUpdate(),
    },
    schema,
  };
});

// Audit writes are side-effects of the paths under test, not their subject.
vi.mock('@/lib/admin/data/real/users', () => ({
  recordAudit: vi.fn(async () => undefined),
}));

import { prepareResourcesForWrite, updateCourse, updateLesson } from './write';
import type { AdminActor } from '@/lib/admin/data/types';
import type { CourseResource } from '@/db/schema';

const actor: AdminActor = { id: 'admin-1', name: 'Testè' };

const goodBilingual: CourseResource = {
  label_ht: 'Gid elèv yo',
  label_fr: 'Guide des élèves',
  url: 'https://example.com/gid.pdf',
  kind: 'file',
};

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://unit-test';
  dbState.selectQueue.length = 0;
  dbState.updates.length = 0;
  dbState.updateReturning.length = 0;
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe('prepareResourcesForWrite — mono mirrors the primary label, bilingual stays strict (Stage 4)', () => {
  it('bilingual: passes a fully-labelled list through, trimmed', () => {
    const res = prepareResourcesForWrite(
      [{ ...goodBilingual, label_ht: '  Gid elèv yo  ', url: ' https://example.com/gid.pdf ' }],
      true,
      'ht',
    );
    expect(res).toEqual({ ok: true, resources: [goodBilingual] });
  });

  it('bilingual: STILL rejects a missing fr label (the strict rule is untouched)', () => {
    const res = prepareResourcesForWrite([{ ...goodBilingual, label_fr: '' }], true, 'ht');
    expect(res).toEqual({ ok: false, message: 'resource_label_fr_required' });
  });

  it('bilingual: STILL rejects a missing ht label', () => {
    const res = prepareResourcesForWrite([{ ...goodBilingual, label_ht: '  ' }], true, 'fr');
    expect(res).toEqual({ ok: false, message: 'resource_label_ht_required' });
  });

  it('mono ht: mirrors label_ht into a missing label_fr', () => {
    const res = prepareResourcesForWrite([{ ...goodBilingual, label_fr: '' }], false, 'ht');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.resources[0].label_fr).toBe('Gid elèv yo');
  });

  it('mono ht: OVERWRITES a stale label_fr too — both sides end byte-identical (the mirrorBilingualFields invariant)', () => {
    const res = prepareResourcesForWrite([{ ...goodBilingual, label_fr: 'stale french' }], false, 'ht');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.resources[0].label_fr).toBe('Gid elèv yo');
  });

  it('mono fr: mirrors label_fr into label_ht', () => {
    const res = prepareResourcesForWrite([{ ...goodBilingual, label_ht: '' }], false, 'fr');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.resources[0].label_ht).toBe('Guide des élèves');
      expect(res.resources[0].label_fr).toBe('Guide des élèves');
    }
  });

  it('mono: an EMPTY primary label is still rejected — mono never waives "every row needs a title"', () => {
    const res = prepareResourcesForWrite([{ ...goodBilingual, label_ht: '  ', label_fr: '' }], false, 'ht');
    expect(res).toEqual({ ok: false, message: 'resource_label_ht_required' });
  });

  it('mono: url and kind are still validated exactly as before', () => {
    expect(prepareResourcesForWrite([{ ...goodBilingual, label_fr: '', url: 'javascript:alert(1)' }], false, 'ht')).toEqual({
      ok: false,
      message: 'resource_url_invalid',
    });
    expect(
      prepareResourcesForWrite([{ ...goodBilingual, label_fr: '', kind: 'video' as CourseResource['kind'] }], false, 'ht'),
    ).toEqual({ ok: false, message: 'resource_kind_invalid' });
  });

  it('does not mutate the input rows', () => {
    const input = [{ ...goodBilingual, label_fr: '' }];
    const frozen = JSON.parse(JSON.stringify(input));
    prepareResourcesForWrite(input, false, 'ht');
    expect(input).toEqual(frozen);
  });

  it('accepts an empty list in both modes', () => {
    expect(prepareResourcesForWrite([], true, 'ht')).toEqual({ ok: true, resources: [] });
    expect(prepareResourcesForWrite([], false, 'fr')).toEqual({ ok: true, resources: [] });
  });
});

describe('updateCourse — resource path traversal (Stage 4)', () => {
  it('monolingual ht course: a one-label patch is mirrored + normalized into the DB set', async () => {
    dbState.selectQueue.push([{ status: 'draft', bilingual: false, primaryLocale: 'ht' }]);
    const res = await updateCourse(
      'kou-kreyol',
      { resources: [{ label_ht: '  Gid elèv yo  ', label_fr: '', url: ' https://example.com/gid.pdf ', kind: 'file' }] },
      actor,
    );
    expect(res.ok).toBe(true);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set.resources).toEqual([
      { label_ht: 'Gid elèv yo', label_fr: 'Gid elèv yo', url: 'https://example.com/gid.pdf', kind: 'file' },
    ]);
  });

  it('monolingual fr course: mirrors in the other direction (fr → ht)', async () => {
    dbState.selectQueue.push([{ status: 'draft', bilingual: false, primaryLocale: 'fr' }]);
    const res = await updateCourse(
      'cours-francais',
      { resources: [{ label_ht: '', label_fr: 'Guide des élèves', url: 'https://example.com/guide.pdf', kind: 'link' }] },
      actor,
    );
    expect(res.ok).toBe(true);
    expect(dbState.updates[0].set.resources).toEqual([
      { label_ht: 'Guide des élèves', label_fr: 'Guide des élèves', url: 'https://example.com/guide.pdf', kind: 'link' },
    ]);
  });

  it('bilingual course: a missing fr label REJECTS the whole write — no update reaches the DB', async () => {
    dbState.selectQueue.push([{ status: 'draft', bilingual: true, primaryLocale: 'ht' }]);
    const res = await updateCourse('kou-bileng', { resources: [{ ...goodBilingual, label_fr: '' }] }, actor);
    expect(res).toEqual({ ok: false, message: 'resource_label_fr_required' });
    expect(dbState.updates).toHaveLength(0);
  });
});

describe('updateLesson — resource path traversal (Stage 4)', () => {
  it('monolingual ht course: a lesson resources save resolves the PARENT course setting server-side and mirrors', async () => {
    dbState.selectQueue.push([{ bilingual: false, primaryLocale: 'ht' }]); // resolveLessonMirrorContext
    dbState.selectQueue.push([{ status: 'draft' }]); // markDirtyAndRevalidateIfPublished
    dbState.updateReturning.push([{ id: 'lesson-1' }]);
    const res = await updateLesson(
      'kou-kreyol',
      'lesson-1',
      { resources: [{ label_ht: 'Fèy egzèsis', label_fr: '', url: 'https://example.com/fey.pdf', kind: 'file' }] },
      actor,
    );
    expect(res.ok).toBe(true);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].set.resources).toEqual([
      { label_ht: 'Fèy egzèsis', label_fr: 'Fèy egzèsis', url: 'https://example.com/fey.pdf', kind: 'file' },
    ]);
  });

  it('bilingual course: a lesson resources save missing one label REJECTS before any write', async () => {
    dbState.selectQueue.push([{ bilingual: true, primaryLocale: 'ht' }]); // resolveLessonMirrorContext
    const res = await updateLesson('kou-bileng', 'lesson-1', { resources: [{ ...goodBilingual, label_ht: '' }] }, actor);
    expect(res).toEqual({ ok: false, message: 'resource_label_ht_required' });
    expect(dbState.updates).toHaveLength(0);
  });

  it('a resources-only save on a MISSING course row falls back to bilingual (strict) — never a silent mirror guess', async () => {
    dbState.selectQueue.push([]); // resolveLessonMirrorContext: course row not found → bilingual defaults
    const res = await updateLesson(
      'kou-fantom',
      'lesson-1',
      { resources: [{ ...goodBilingual, label_fr: '' }] },
      actor,
    );
    expect(res).toEqual({ ok: false, message: 'resource_label_fr_required' });
    expect(dbState.updates).toHaveLength(0);
  });
});
