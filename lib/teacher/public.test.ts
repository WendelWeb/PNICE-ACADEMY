/**
 * Unit tests for lib/teacher/public.ts (Task C3-T7) — the pure protocol
 * allowlist (`isSafePhotoUrl`), the pure approved-only gate
 * (`shouldShowPublicPage`), the pure identity-overlay precedence
 * (`resolvePublicIdentity`), and the gated `getPublicTeacher` fallback (no
 * DATABASE_URL ⇒ teacher #1 renders identically to today via the static
 * data/teachers.ts fallback; unknown slug ⇒ null). No live DB is touched:
 * this test environment has no DATABASE_URL set (vitest.config.ts doesn't
 * load .env.local — see lib/courses/source.test.ts's header for the same
 * reasoning), so getPublicTeacher runs its fallback path throughout.
 */
import { describe, it, expect } from 'vitest';
import {
  isSafePhotoUrl,
  shouldShowPublicPage,
  resolvePublicIdentity,
  initialsFromName,
  getApprovedTeacherSlugs,
  getPublicTeacher,
  resolveTeacherOwnerUserIdBySlug,
  getCourseTeacherSlug,
  getAllPublicTeachers,
} from './public';
import { teachers } from '@/data/teachers';
import type { TeacherProfile } from './profile';
import { courses } from '@/data/courses';

const approvedProfile: TeacherProfile = {
  id: 'tp-1',
  userId: 'user-1',
  slug: 'pwofese-live',
  displayName: 'Pwofesè Live',
  bioHt: 'Bio kreyòl anba a.',
  bioFr: 'Bio française à jour.',
  photoUrl: 'https://example.com/photo.jpg',
  status: 'approved',
  payoutMethod: 'moncash',
  payoutDestination: '+509 1234 5678',
  videoQuotaMinutes: 600,
  termsAcceptedAt: '2026-01-01T00:00:00.000Z',
  reviewNote: null,
  reviewedBy: 'admin-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('isSafePhotoUrl — render-time protocol allowlist', () => {
  it('accepts http and https URLs', () => {
    expect(isSafePhotoUrl('https://example.com/a.jpg')).toBe(true);
    expect(isSafePhotoUrl('http://example.com/a.jpg')).toBe(true);
  });

  it('rejects javascript:/data: and malformed URLs', () => {
    expect(isSafePhotoUrl('javascript:alert(1)')).toBe(false);
    expect(isSafePhotoUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafePhotoUrl('not a url')).toBe(false);
  });

  it('rejects null/undefined/empty', () => {
    expect(isSafePhotoUrl(null)).toBe(false);
    expect(isSafePhotoUrl(undefined)).toBe(false);
    expect(isSafePhotoUrl('')).toBe(false);
  });
});

describe('shouldShowPublicPage — approved-only gate, teacher #1 exception', () => {
  it('teacher #1 always shows, regardless of profile status', () => {
    expect(shouldShowPublicPage({ isTeacherOne: true, profileStatus: null })).toBe(true);
    expect(shouldShowPublicPage({ isTeacherOne: true, profileStatus: 'pending' })).toBe(true);
    expect(shouldShowPublicPage({ isTeacherOne: true, profileStatus: 'suspended' })).toBe(true);
    expect(shouldShowPublicPage({ isTeacherOne: true, profileStatus: 'rejected' })).toBe(true);
  });

  it('any other teacher requires status = approved', () => {
    expect(shouldShowPublicPage({ isTeacherOne: false, profileStatus: 'approved' })).toBe(true);
    expect(shouldShowPublicPage({ isTeacherOne: false, profileStatus: 'pending' })).toBe(false);
    expect(shouldShowPublicPage({ isTeacherOne: false, profileStatus: 'suspended' })).toBe(false);
    expect(shouldShowPublicPage({ isTeacherOne: false, profileStatus: 'rejected' })).toBe(false);
    expect(shouldShowPublicPage({ isTeacherOne: false, profileStatus: null })).toBe(false);
  });
});

describe('resolvePublicIdentity — live profile overlays static fallback, never the reverse', () => {
  const base = { staticDisplayName: 'Static Name', staticBio: 'Static bio.', locale: 'ht' };

  it('no profile at all -> pure static fallback, no photo', () => {
    const r = resolvePublicIdentity({ ...base, profile: null });
    expect(r).toEqual({ displayName: 'Static Name', bio: 'Static bio.', photoUrl: null });
  });

  it('a non-approved profile is ignored entirely, even if fully populated', () => {
    const pending: TeacherProfile = { ...approvedProfile, status: 'pending' };
    const r = resolvePublicIdentity({ ...base, profile: pending });
    expect(r).toEqual({ displayName: 'Static Name', bio: 'Static bio.', photoUrl: null });
  });

  it('an approved profile overlays name/bio/photo per-locale', () => {
    const rHt = resolvePublicIdentity({ ...base, profile: approvedProfile, locale: 'ht' });
    expect(rHt).toEqual({
      displayName: 'Pwofesè Live',
      bio: 'Bio kreyòl anba a.',
      photoUrl: 'https://example.com/photo.jpg',
    });
    const rFr = resolvePublicIdentity({ ...base, profile: approvedProfile, locale: 'fr' });
    expect(rFr.bio).toBe('Bio française à jour.');
  });

  it('an approved profile with an empty bio for one locale falls back to static for that locale', () => {
    const partial: TeacherProfile = { ...approvedProfile, bioFr: '   ' };
    const r = resolvePublicIdentity({ ...base, profile: partial, locale: 'fr' });
    expect(r.bio).toBe('Static bio.');
  });

  it('an approved profile with an unsafe photo URL falls back to no photo (never renders it)', () => {
    const unsafe: TeacherProfile = { ...approvedProfile, photoUrl: 'javascript:alert(1)' };
    const r = resolvePublicIdentity({ ...base, profile: unsafe });
    expect(r.photoUrl).toBeNull();
  });

  it('an approved profile with an empty display name falls back to the static one', () => {
    const noName: TeacherProfile = { ...approvedProfile, displayName: '   ' };
    const r = resolvePublicIdentity({ ...base, profile: noName });
    expect(r.displayName).toBe('Static Name');
  });
});

describe('initialsFromName — seal initials for a DB-only teacher (Task: DB-backed teacher slugs)', () => {
  it('takes the first letter of up to two words, uppercased', () => {
    expect(initialsFromName('Jean Pierre')).toBe('JP');
  });

  it('handles a single-word name', () => {
    expect(initialsFromName('Ochre')).toBe('O');
  });

  it('ignores extra words past the first two', () => {
    expect(initialsFromName('Jean Marie Pierre Louis')).toBe('JM');
  });

  it('falls back to "??" for an empty/whitespace-only name', () => {
    expect(initialsFromName('')).toBe('??');
    expect(initialsFromName('   ')).toBe('??');
  });
});

describe('getApprovedTeacherSlugs — gated fallback, no DATABASE_URL', () => {
  it('falls back to [] with no DB', async () => {
    expect(await getApprovedTeacherSlugs()).toEqual([]);
  });
});

describe('getPublicTeacher — gated fallback, no DATABASE_URL', () => {
  it('unknown slug -> null (404), including one only a live DB could resolve', async () => {
    expect(await getPublicTeacher('nope', 'ht')).toBeNull();
    expect(await getPublicTeacher('some-db-only-teacher', 'ht')).toBeNull();
  });

  it('teacher #1 renders identically to today via the static fallback', async () => {
    const teacher = await getPublicTeacher('pnice-academy', 'ht');
    expect(teacher).not.toBeNull();
    expect(teacher!.displayName).toBe('PNICE Academy');
    expect(teacher!.photoUrl).toBeNull(); // no live DB profile -> branded placeholder
    expect(teacher!.rating).toEqual({ avg: null, count: 0 });
    expect(teacher!.studentCount).toBeNull();
    expect(teacher!.hasPlan).toBe(true); // teacher #1's fallback always has the $79 plan block
    // Task: real per-teacher plan price — `plan` (the real DB row) stays
    // `null` in the no-DB fallback (nothing live to read a real price from);
    // renderers fall back to SUBSCRIPTION_USD themselves (see
    // app/[locale]/(site)/prof/[slug]/page.tsx), never a wrong number.
    expect(teacher!.plan).toBeNull();
    expect(teacher!.courseCount).toBe(courses.length);
    expect(teacher!.courses).toHaveLength(courses.length);
    expect(teacher!.docNo).toBe('ANS-2026-001');
  });

  it('resolves bio per-locale from the static fallback', async () => {
    const ht = await getPublicTeacher('pnice-academy', 'ht');
    const fr = await getPublicTeacher('pnice-academy', 'fr');
    expect(ht!.bio).not.toBe(fr!.bio);
  });
});

// Task: per-teacher subscription checkout — shared by
// lib/payments/products.ts so a checkout charges the SAME owner
// /prof/[slug] itself resolves.
describe('resolveTeacherOwnerUserIdBySlug — shared slug -> owner resolution, no DATABASE_URL', () => {
  it("resolves teacher #1's own slug via the static registry (no DB needed)", async () => {
    // No DATABASE_URL in this test env ⇒ getTeacherOwnerUserId itself falls
    // back to null (see lib/reviews/reviews.ts), but the static-registry
    // branch is taken either way — this asserts it never throws and returns
    // a nullable string, not that a DB-only owner id resolves without a DB.
    await expect(resolveTeacherOwnerUserIdBySlug(teachers[0]!.slug)).resolves.toBeNull();
  });

  it('an unknown slug (no static entry, no DB) resolves to null, never throws', async () => {
    await expect(resolveTeacherOwnerUserIdBySlug('no-such-teacher')).resolves.toBeNull();
  });
});

// Stage 4 — real attribution everywhere public: course slug -> owning
// teacher's /prof slug, DB-first with the static registry as fallback.
describe('getCourseTeacherSlug — gated fallback, no DATABASE_URL', () => {
  it('resolves every static-registry course to teacher #1 via the fallback', async () => {
    expect(await getCourseTeacherSlug(courses[0]!.slug)).toBe(teachers[0]!.slug);
  });

  it('an unknown course slug resolves to null, never throws', async () => {
    expect(await getCourseTeacherSlug('pa-egziste')).toBeNull();
  });
});

// Stage 4 — the /prof teacher directory read.
describe('getAllPublicTeachers — gated fallback, no DATABASE_URL', () => {
  it('with no DB the roster is exactly the static registry (teacher #1 still shows)', async () => {
    const roster = await getAllPublicTeachers('ht');
    expect(roster.map((t) => t.slug)).toEqual(teachers.map((t) => t.slug));
    expect(roster[0]!.displayName).toBe('PNICE Academy');
  });
});
