/**
 * Unit tests for lib/courses/write.ts's `toAdminStatus` (Task C3 fix). Pure
 * function, no DB touched.
 *
 * Before this fix, `toAdminStatus` collapsed every status other than
 * 'published' down to 'draft' — harmless for the pre-C3 single-owner CMS
 * (nothing but draft/published ever existed), but once teacher-submitted
 * courses can sit in pending_review/rejected, that collapse hid the real
 * status from `components/admin/content/PublishBar.tsx`, which then
 * rendered a one-click Publish button for a course still awaiting (or
 * having failed) moderation — a course.edit-gated admin-CMS bypass of the
 * teachers.review-gated moderation queue. `toAdminStatus` must now be a
 * pass-through: every DB status is exposed as-is.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  toAdminStatus,
  validateResource,
  validateResources,
  computeAdjacentSwap,
  computeLessonSwap,
  repackChapterIndices,
  shouldReplaceBunnyVideo,
  mirrorBilingualFields,
  COURSE_BILINGUAL_PAIR_COLUMNS,
  LESSON_BILINGUAL_PAIR_COLUMNS,
  CHAPTER_BILINGUAL_PAIR_COLUMNS,
  countCoursesPendingReview,
  type DbCourseStatus,
} from './write';
import type { CourseResource } from '@/db/schema';

describe("toAdminStatus — must expose the real status, never collapse (Task C3 fix)", () => {
  const statuses: DbCourseStatus[] = ['draft', 'pending_review', 'published', 'rejected', 'archived'];

  it('maps every status to itself', () => {
    for (const status of statuses) {
      expect(toAdminStatus(status)).toBe(status);
    }
  });

  it('does NOT collapse pending_review into draft', () => {
    expect(toAdminStatus('pending_review')).toBe('pending_review');
    expect(toAdminStatus('pending_review')).not.toBe('draft');
  });

  it('does NOT collapse rejected into draft', () => {
    expect(toAdminStatus('rejected')).toBe('rejected');
    expect(toAdminStatus('rejected')).not.toBe('draft');
  });
});

/**
 * Unit tests for `validateResource`/`validateResources` (Task K1 — plan de
 * cours complet). A lesson/course `resources` entry is self-serve teacher
 * input reaching a public render (link/download list), so every field is
 * validated at write time and an invalid entry must be REJECTED with a clear
 * reason code, never silently dropped.
 */
describe('validateResource — url allowlist + label rules (Task K1)', () => {
  const base: CourseResource = { label_ht: 'Kado', label_fr: 'Cadeau', url: 'https://example.com/a.pdf', kind: 'file' };

  it('accepts a well-formed http(s) resource', () => {
    expect(validateResource(base)).toBeNull();
    expect(validateResource({ ...base, url: 'http://example.com/a.pdf' })).toBeNull();
    expect(validateResource({ ...base, kind: 'link' })).toBeNull();
  });

  it('rejects javascript:/data: and malformed URLs', () => {
    expect(validateResource({ ...base, url: 'javascript:alert(1)' })).toBe('resource_url_invalid');
    expect(validateResource({ ...base, url: 'data:text/html,<script>alert(1)</script>' })).toBe(
      'resource_url_invalid',
    );
    expect(validateResource({ ...base, url: 'not a url' })).toBe('resource_url_invalid');
    expect(validateResource({ ...base, url: '' })).toBe('resource_url_invalid');
  });

  it('rejects an empty label in either language', () => {
    expect(validateResource({ ...base, label_ht: '' })).toBe('resource_label_ht_required');
    expect(validateResource({ ...base, label_ht: '   ' })).toBe('resource_label_ht_required');
    expect(validateResource({ ...base, label_fr: '' })).toBe('resource_label_fr_required');
  });

  it('rejects a label over 120 characters', () => {
    const long = 'x'.repeat(121);
    expect(validateResource({ ...base, label_ht: long })).toBe('resource_label_ht_too_long');
    expect(validateResource({ ...base, label_fr: long })).toBe('resource_label_fr_too_long');
    expect(validateResource({ ...base, label_ht: 'x'.repeat(120) })).toBeNull();
  });

  it('rejects an invalid kind', () => {
    expect(validateResource({ ...base, kind: 'video' as CourseResource['kind'] })).toBe('resource_kind_invalid');
  });
});

describe('validateResources — first failing entry in a list (Task K1)', () => {
  const good: CourseResource = { label_ht: 'Kado', label_fr: 'Cadeau', url: 'https://example.com', kind: 'link' };

  it('accepts an empty list and a list of only valid entries', () => {
    expect(validateResources([])).toBeNull();
    expect(validateResources([good, good])).toBeNull();
  });

  it('reports the reason of the first invalid entry, not just "invalid"', () => {
    const bad: CourseResource = { ...good, url: 'javascript:alert(1)' };
    expect(validateResources([good, bad])).toBe('resource_url_invalid');
  });
});

/**
 * Unit tests for the chapter reorder/repack index math (Task K1), extracted
 * as pure helpers so they're testable without a DB — see `reorderChapters`/
 * `deleteChapter` for how the DB layer applies these via the same
 * scratch-index-swap trick `reorderLessons` already used.
 */
describe('computeAdjacentSwap — reorder index math (Task K1)', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('swaps with the previous neighbour on "up"', () => {
    expect(computeAdjacentSwap(ids, 'c', 'up')).toEqual(['c', 'b']);
  });

  it('swaps with the next neighbour on "down"', () => {
    expect(computeAdjacentSwap(ids, 'b', 'down')).toEqual(['b', 'c']);
  });

  it('returns null when already at the top moving up', () => {
    expect(computeAdjacentSwap(ids, 'a', 'up')).toBeNull();
  });

  it('returns null when already at the bottom moving down', () => {
    expect(computeAdjacentSwap(ids, 'd', 'down')).toBeNull();
  });

  it('returns null when the id is not found', () => {
    expect(computeAdjacentSwap(ids, 'z', 'up')).toBeNull();
  });
});

describe('repackChapterIndices — closes gaps after a delete, preserves order (Task K1)', () => {
  it('renumbers sequentially from 1, preserving the given order', () => {
    // e.g. chapters at indices [1, 2, 4, 5] after the chapter holding index 3 was deleted.
    const remaining = [{ index: 1 }, { index: 2 }, { index: 4 }, { index: 5 }];
    expect(repackChapterIndices(remaining)).toEqual([1, 2, 3, 4]);
  });

  it('is a no-op renumbering when there is no gap', () => {
    const remaining = [{ index: 1 }, { index: 2 }, { index: 3 }];
    expect(repackChapterIndices(remaining)).toEqual([1, 2, 3]);
  });

  it('returns [] for an empty list', () => {
    expect(repackChapterIndices([])).toEqual([]);
  });
});

/**
 * Unit tests for the lesson reorder neighbour-selection math (K2 fix): a
 * lesson's up/down swap must be scoped to lessons sharing its OWN
 * `chapterId`, never a globally-adjacent lesson in a DIFFERENT chapter — see
 * `computeLessonSwap`'s doc comment in write.ts for the interleaving bug this
 * guards against (`addLesson`'s course-wide `max(index)+1` append naturally
 * interleaves chapters under normal use).
 */
describe('computeLessonSwap — reorder neighbour must stay within the same chapter (K2 fix)', () => {
  it('flat course (every chapterId null) behaves exactly like the old course-wide adjacency', () => {
    const rows = [
      { id: 'l1', chapterId: null },
      { id: 'l2', chapterId: null },
      { id: 'l3', chapterId: null },
      { id: 'l4', chapterId: null },
    ];
    expect(computeLessonSwap(rows, 'l2', 'up')).toEqual(['l2', 'l1']);
    expect(computeLessonSwap(rows, 'l2', 'down')).toEqual(['l2', 'l3']);
    expect(computeLessonSwap(rows, 'l1', 'up')).toBeNull();
    expect(computeLessonSwap(rows, 'l4', 'down')).toBeNull();
  });

  it('INTERLEAVED regression: ch1=[idx1,idx2,idx4], ch2=[idx3] — "down" on idx2 swaps with idx4 (its own chapter), not ch2\'s idx3', () => {
    // Sorted by index ascending — idx1(ch1), idx2(ch1), idx3(ch2), idx4(ch1) —
    // exactly what results from: add 2 lessons to ch1, 1 to ch2, then 1 more
    // to ch1 (addLesson always appends at course-wide max(index)+1).
    const rows = [
      { id: 'idx1', chapterId: 'ch1' },
      { id: 'idx2', chapterId: 'ch1' },
      { id: 'idx3', chapterId: 'ch2' },
      { id: 'idx4', chapterId: 'ch1' },
    ];
    expect(computeLessonSwap(rows, 'idx2', 'down')).toEqual(['idx2', 'idx4']);
  });

  it('boundary: last lesson in a chapter is invalid_move even when a globally-later lesson exists in another chapter', () => {
    const rows = [
      { id: 'a1', chapterId: 'ch1' },
      { id: 'a2', chapterId: 'ch2' },
      { id: 'a3', chapterId: 'ch1' }, // ch1's last lesson
      { id: 'a4', chapterId: 'ch2' }, // comes after a3 globally, but a different chapter
    ];
    expect(computeLessonSwap(rows, 'a3', 'down')).toBeNull();
  });

  it('returns null when the lesson id is not found', () => {
    const rows = [{ id: 'l1', chapterId: null }];
    expect(computeLessonSwap(rows, 'zzz', 'up')).toBeNull();
  });
});

/**
 * Unit tests for `shouldReplaceBunnyVideo` (bunny-organization branch CRITICAL
 * fix): extracted from `updateLesson`'s previously-untested inline orphan-
 * cleanup conditional. Must be true ONLY for a genuine replacement (both ids
 * non-empty and different) — every other case (no-op same id, clearing to
 * empty, first-time set) must be false, since none of those should ever
 * trigger a `deleteBunnyVideo` call on the OLD id.
 */
describe('shouldReplaceBunnyVideo — orphan-cleanup gate (bunny-organization CRITICAL fix)', () => {
  it('is false for a no-op write (same id)', () => {
    expect(shouldReplaceBunnyVideo('guid-1', 'guid-1')).toBe(false);
  });

  it('is false when clearing the id to empty (deliberate detach, not a replacement)', () => {
    expect(shouldReplaceBunnyVideo('guid-1', '')).toBe(false);
    expect(shouldReplaceBunnyVideo('guid-1', null)).toBe(false);
    expect(shouldReplaceBunnyVideo('guid-1', undefined)).toBe(false);
  });

  it('is false for a first-time set (no previous id)', () => {
    expect(shouldReplaceBunnyVideo(null, 'guid-1')).toBe(false);
    expect(shouldReplaceBunnyVideo(undefined, 'guid-1')).toBe(false);
    expect(shouldReplaceBunnyVideo('', 'guid-1')).toBe(false);
  });

  it('is true for a genuine replacement (both non-empty and different)', () => {
    expect(shouldReplaceBunnyVideo('guid-old', 'guid-new')).toBe(true);
  });

  it('is false when both old and new are empty/nullish', () => {
    expect(shouldReplaceBunnyVideo(null, null)).toBe(false);
    expect(shouldReplaceBunnyVideo(undefined, undefined)).toBe(false);
    expect(shouldReplaceBunnyVideo('', '')).toBe(false);
  });
});

/**
 * Unit tests for `mirrorBilingualFields` (Task: course-language — optional
 * course translation). THE ONE PLACE both `createCourse` and `updateCourse`
 * funnel their DB insert-values/`set` object through when a course is
 * monolingual (`bilingual === false`), so every ht/fr column pair — plain
 * strings AND the jsonb string[]/faq arrays — ends up byte-identical on both
 * sides. Pure function, no DB touched.
 */
describe('mirrorBilingualFields — THE ONE PLACE monolingual courses mirror ht/fr pairs (Task: course-language)', () => {
  it('is a no-op when bilingual is true, regardless of primaryLocale', () => {
    const values = { titleHt: 'Kreyòl', titleFr: undefined };
    expect(mirrorBilingualFields(values, true, 'ht')).toEqual(values);
    expect(mirrorBilingualFields(values, true, 'fr')).toEqual(values);
  });

  it('does not mutate the input object', () => {
    const values = { titleHt: 'Kreyòl', titleFr: undefined };
    const frozen = { ...values };
    mirrorBilingualFields(values, false, 'ht');
    expect(values).toEqual(frozen);
  });

  it('mirrors a plain string pair FROM the ht side when primaryLocale is ht', () => {
    const out = mirrorBilingualFields({ titleHt: 'Tit kreyòl', titleFr: 'stale french value' }, false, 'ht');
    expect(out.titleFr).toBe('Tit kreyòl');
    expect(out.titleHt).toBe('Tit kreyòl');
  });

  it('mirrors a plain string pair FROM the fr side when primaryLocale is fr', () => {
    const out = mirrorBilingualFields({ titleHt: 'stale kreyòl value', titleFr: 'Titre français' }, false, 'fr');
    expect(out.titleHt).toBe('Titre français');
    expect(out.titleFr).toBe('Titre français');
  });

  it('only mirrors a pair actually present in `values` this call — leaves untouched pairs alone', () => {
    // A partial `updateCourse` patch that only touches `tagline`, not `title`.
    const out = mirrorBilingualFields<Record<string, unknown>>({ taglineHt: 'Akwòch' }, false, 'ht');
    expect(out.taglineFr).toBe('Akwòch');
    expect(out).not.toHaveProperty('titleHt');
    expect(out).not.toHaveProperty('titleFr');
  });

  it('does nothing to a pair where neither side is present', () => {
    const out = mirrorBilingualFields({ priceCents: 1900 }, false, 'ht');
    expect(out).toEqual({ priceCents: 1900 });
  });

  it('mirrors jsonb string[] array pairs (learn/deliverables/prereq) by full-array replacement', () => {
    const out = mirrorBilingualFields(
      { learnHt: ['A', 'B'], learnFr: ['stale', 'french', 'array'] },
      false,
      'ht',
    );
    expect(out.learnFr).toEqual(['A', 'B']);
  });

  it('mirrors the faq jsonb array pair (list of {q,a}) by full-array replacement', () => {
    const faqHt = [{ q: 'Kesyon?', a: 'Repons.' }];
    const out = mirrorBilingualFields({ faqHt, faqFr: [{ q: 'stale', a: 'stale' }] }, false, 'ht');
    expect(out.faqFr).toEqual(faqHt);
  });

  it('covers every pair in COURSE_BILINGUAL_PAIR_COLUMNS — the owner\'s exact list (title, tagline, audience, learn, level, promise, problem, deliverables, prereq, faq)', () => {
    expect(COURSE_BILINGUAL_PAIR_COLUMNS).toHaveLength(10);
    for (const [htKey, frKey] of COURSE_BILINGUAL_PAIR_COLUMNS) {
      const primaryValue = `primary-value-for-${htKey}`;
      const out = mirrorBilingualFields({ [htKey]: primaryValue, [frKey]: 'stale' }, false, 'ht');
      expect(out[frKey]).toBe(primaryValue);
      expect(out[htKey]).toBe(primaryValue);
    }
  });

  it('mirrors in the OTHER direction (fr → ht) for every pair when primaryLocale is fr', () => {
    for (const [htKey, frKey] of COURSE_BILINGUAL_PAIR_COLUMNS) {
      const primaryValue = `french-value-for-${frKey}`;
      const out = mirrorBilingualFields({ [htKey]: 'stale', [frKey]: primaryValue }, false, 'fr');
      expect(out[htKey]).toBe(primaryValue);
      expect(out[frKey]).toBe(primaryValue);
    }
  });

  it('preserves non-pair fields untouched (icon, priceCents, status, bilingual, primaryLocale itself)', () => {
    const out = mirrorBilingualFields(
      { titleHt: 'Tit', titleFr: 'stale', icon: 'book', priceCents: 900, status: 'draft', bilingual: false, primaryLocale: 'ht' },
      false,
      'ht',
    );
    expect(out.icon).toBe('book');
    expect(out.priceCents).toBe(900);
    expect(out.status).toBe('draft');
    expect(out.bilingual).toBe(false);
    expect(out.primaryLocale).toBe('ht');
  });
});

/**
 * Unit tests for `mirrorBilingualFields` fed `LESSON_BILINGUAL_PAIR_COLUMNS`
 * (Task: lesson-language — the sibling of the course-level suite above, same
 * function, different column-pair list). `updateLesson` funnels its `set`
 * object through exactly this call when the parent course is monolingual —
 * see lib/courses/write.ts's doc comment on `resolveLessonMirrorContext`.
 * Pure function, no DB touched.
 */
describe('mirrorBilingualFields(LESSON_BILINGUAL_PAIR_COLUMNS) — lesson title/desc/notes mirror the same way course fields do (Task: lesson-language)', () => {
  it('covers exactly the three lesson pairs: title, desc, notes', () => {
    expect(LESSON_BILINGUAL_PAIR_COLUMNS).toEqual([
      ['titleHt', 'titleFr'],
      ['descHt', 'descFr'],
      ['notesHt', 'notesFr'],
    ]);
  });

  it('is a no-op for a bilingual course, regardless of primaryLocale — a bilingual course\'s lesson save is untouched', () => {
    const values = { titleHt: 'Tit kreyòl', titleFr: 'Titre français', descHt: 'D ht', descFr: 'D fr', notesHt: 'N ht', notesFr: 'N fr' };
    expect(mirrorBilingualFields(values, true, 'ht', LESSON_BILINGUAL_PAIR_COLUMNS)).toEqual(values);
    expect(mirrorBilingualFields(values, true, 'fr', LESSON_BILINGUAL_PAIR_COLUMNS)).toEqual(values);
  });

  it('mirrors all three pairs FROM the ht side when primaryLocale is ht (monolingual course)', () => {
    const out = mirrorBilingualFields(
      {
        titleHt: 'Tit leson', titleFr: 'stale title',
        descHt: 'Deskripsyon leson', descFr: 'stale desc',
        notesHt: 'Nòt pou elèv', notesFr: 'stale notes',
      },
      false,
      'ht',
      LESSON_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out.titleFr).toBe('Tit leson');
    expect(out.descFr).toBe('Deskripsyon leson');
    expect(out.notesFr).toBe('Nòt pou elèv');
    // Primary side itself is left as-is (not blanked, not altered).
    expect(out.titleHt).toBe('Tit leson');
    expect(out.descHt).toBe('Deskripsyon leson');
    expect(out.notesHt).toBe('Nòt pou elèv');
  });

  it('mirrors all three pairs FROM the fr side when primaryLocale is fr (monolingual course)', () => {
    const out = mirrorBilingualFields(
      {
        titleHt: 'stale title', titleFr: 'Titre de la leçon',
        descHt: 'stale desc', descFr: 'Description de la leçon',
        notesHt: 'stale notes', notesFr: "Notes pour l'élève",
      },
      false,
      'fr',
      LESSON_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out.titleHt).toBe('Titre de la leçon');
    expect(out.descHt).toBe('Description de la leçon');
    expect(out.notesHt).toBe("Notes pour l'élève");
  });

  it('only mirrors a lesson pair actually present in the patch\'s `set` object — a video-only save touches nothing', () => {
    const out = mirrorBilingualFields<Record<string, unknown>>(
      { bunnyVideoId: 'guid-123', updatedAt: new Date('2026-08-01') },
      false,
      'ht',
      LESSON_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out).not.toHaveProperty('titleHt');
    expect(out).not.toHaveProperty('descHt');
    expect(out).not.toHaveProperty('notesHt');
    expect(out.bunnyVideoId).toBe('guid-123');
  });

  it('mirrors only the pair present when a save touches just one of the three (e.g. notes only)', () => {
    const out = mirrorBilingualFields<Record<string, unknown>>(
      { notesHt: 'Nouvo nòt', notesFr: 'stale' },
      false,
      'ht',
      LESSON_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out.notesFr).toBe('Nouvo nòt');
    expect(out).not.toHaveProperty('titleHt');
    expect(out).not.toHaveProperty('descHt');
  });
});

/**
 * Unit tests for `mirrorBilingualFields` fed `CHAPTER_BILINGUAL_PAIR_COLUMNS`
 * (Task: chapter-language — the sibling of the lesson-level suite above,
 * same function, different column-pair list). `updateChapter` funnels its
 * `set` object through exactly this call when the parent course is
 * monolingual — see lib/courses/write.ts's doc comment on
 * `resolveLessonMirrorContext`. Pure function, no DB touched.
 */
describe('mirrorBilingualFields(CHAPTER_BILINGUAL_PAIR_COLUMNS) — chapter title/summary mirror the same way course/lesson fields do (Task: chapter-language)', () => {
  it('covers exactly the two chapter pairs: title, summary', () => {
    expect(CHAPTER_BILINGUAL_PAIR_COLUMNS).toEqual([
      ['titleHt', 'titleFr'],
      ['summaryHt', 'summaryFr'],
    ]);
  });

  it('is a no-op for a bilingual course, regardless of primaryLocale — a bilingual course\'s chapter save is untouched', () => {
    const values = { titleHt: 'Chapit kreyòl', titleFr: 'Chapitre français', summaryHt: 'Rezime ht', summaryFr: 'Résumé fr' };
    expect(mirrorBilingualFields(values, true, 'ht', CHAPTER_BILINGUAL_PAIR_COLUMNS)).toEqual(values);
    expect(mirrorBilingualFields(values, true, 'fr', CHAPTER_BILINGUAL_PAIR_COLUMNS)).toEqual(values);
  });

  it('mirrors both pairs FROM the ht side when primaryLocale is ht (monolingual course)', () => {
    const out = mirrorBilingualFields(
      { titleHt: 'Tit chapit', titleFr: 'stale title', summaryHt: 'Rezime chapit', summaryFr: 'stale summary' },
      false,
      'ht',
      CHAPTER_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out.titleFr).toBe('Tit chapit');
    expect(out.summaryFr).toBe('Rezime chapit');
    // Primary side itself is left as-is (not blanked, not altered).
    expect(out.titleHt).toBe('Tit chapit');
    expect(out.summaryHt).toBe('Rezime chapit');
  });

  it('mirrors both pairs FROM the fr side when primaryLocale is fr (monolingual course)', () => {
    const out = mirrorBilingualFields(
      { titleHt: 'stale title', titleFr: 'Titre du chapitre', summaryHt: 'stale summary', summaryFr: 'Résumé du chapitre' },
      false,
      'fr',
      CHAPTER_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out.titleHt).toBe('Titre du chapitre');
    expect(out.summaryHt).toBe('Résumé du chapitre');
  });

  it('only mirrors a chapter pair actually present in the patch\'s `set` object — a title-only save leaves summary untouched', () => {
    const out = mirrorBilingualFields<Record<string, unknown>>(
      { titleHt: 'Nouvo tit', titleFr: 'stale', updatedAt: new Date('2026-08-01') },
      false,
      'ht',
      CHAPTER_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out.titleFr).toBe('Nouvo tit');
    expect(out).not.toHaveProperty('summaryHt');
    expect(out).not.toHaveProperty('summaryFr');
  });

  it('mirrors only the pair present when a save touches just summary', () => {
    const out = mirrorBilingualFields<Record<string, unknown>>(
      { summaryHt: 'Nouvo rezime', summaryFr: 'stale' },
      false,
      'ht',
      CHAPTER_BILINGUAL_PAIR_COLUMNS,
    );
    expect(out.summaryFr).toBe('Nouvo rezime');
    expect(out).not.toHaveProperty('titleHt');
    expect(out).not.toHaveProperty('titleFr');
  });
});

describe('countCoursesPendingReview — gated count (Stage 7 sidebar badge)', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('falls back to 0 with no DATABASE_URL, never throws', async () => {
    delete process.env.DATABASE_URL;
    expect(await countCoursesPendingReview()).toBe(0);
  });
});
