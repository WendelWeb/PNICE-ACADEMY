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
import { describe, it, expect } from 'vitest';
import {
  toAdminStatus,
  validateResource,
  validateResources,
  computeAdjacentSwap,
  repackChapterIndices,
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
