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
import { toAdminStatus, type DbCourseStatus } from './write';

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
