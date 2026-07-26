/**
 * lib/teacher/public.ts — the public `/prof/[slug]` read (Task C3-T7).
 * Companion to lib/teacher/profile.ts (the authenticated studio reads) —
 * this module is the PUBLIC-FACING counterpart: one gated, never-throw
 * `getPublicTeacher(slug, locale)` that resolves everything the page needs.
 *
 * SLUG RESOLUTION (v1 — documented, a deliberate simplification): the
 * `teacher_profiles` table has no `slug` column — it's keyed by `user_id`.
 * `data/teachers.ts` is the only slug ↔ identity registry that exists today
 * (one row: teacher #1, the platform/founder account). This module reuses
 * that static registry as the slug lookup: `getTeacher(slug)` resolves WHO
 * the slug refers to (their `courseSlugs`), then `getTeacherOwnerUserId`
 * (lib/reviews/reviews.ts, already used this way since Task C3-T6) resolves
 * their DB `users.id` from any of those slugs' `courses.owner_user_id`. Once
 * we know the owner, EVERY live field (profile bio/photo/status, owned
 * course slugs, rating, student count, active teacher_plan) is read from the
 * real DB and overlaid on the static fallback — never the reverse. An
 * unknown slug (not in `data/teachers.ts`) → `null`, always (404) — v1 has no
 * other registry to consult.
 *
 * FOLLOW-UP (once a second real teacher exists): add a real
 * `teacher_profiles.slug` column (migration) and resolve the slug against
 * that table directly instead of `data/teachers.ts`; keep the static file
 * only as historical seed content if still wanted.
 *
 * APPROVED-ONLY GATE: only a teacher with a LIVE `teacher_profiles` row whose
 * `status = 'approved'` gets a public page — pending/rejected/suspended →
 * `null` (404). The ONE exception is teacher #1 (`isTeacherOne`): the
 * platform's own showcase page is ALWAYS shown, even with no `teacher_profiles`
 * row at all (not seeded yet) or a non-approved one — falling back to the
 * static `data/teachers.ts` fields exactly like the page has always rendered.
 * This is what keeps today's page byte-identical with no DB / before C3-T8
 * seeds the founder's profile row.
 *
 * GATED + NEVER-THROW throughout, mirroring lib/courses/source.ts /
 * lib/teacher/profile.ts / lib/reviews/reviews.ts exactly: no DATABASE_URL,
 * a failed query, or nothing resolved ⇒ a safe fallback (the static teacher
 * #1 fields, or `null`/`[]` for genuinely unknown/ungated data) — never
 * throws.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured, getPublishedCourses } from '@/lib/courses/source';
import type { Course } from '@/data/courses';
import { getTeacher, teachers, teacherBio, teacherDocNo } from '@/data/teachers';
import { getTeacherProfile, type TeacherProfile } from '@/lib/teacher/profile';
import { getTeacherOwnerUserId, getTeacherRating, type RatingSummary } from '@/lib/reviews/reviews';
import { isValidHttpUrl } from '@/lib/teacher/apply-validation';

const T = schema;

export type PublicTeacher = {
  slug: string;
  displayName: string;
  /** Seal initials — always from the static registry (no DB counterpart yet). */
  initials: string;
  /** Base name for `siteImageSrc()` — the branded placeholder shown when no live photo. */
  imageName: string;
  bio: string;
  /** A validated http(s) URL, or `null` — render the branded placeholder when null. */
  photoUrl: string | null;
  docNo: string;
  rating: RatingSummary;
  courseCount: number;
  /** Distinct actively-enrolled students across the teacher's courses — `null` if not computable (no DB). */
  studentCount: number | null;
  courses: Course[];
  joinedYear: number;
  /** Whether this teacher has an active `teacher_plan` (the $79 all-access pass) — gates the subscription block. */
  hasPlan: boolean;
};

/**
 * True only when `url` is a well-formed http(s) URL — the RENDER-time
 * protocol allowlist for a teacher's `photo_url`. Reuses the exact same rule
 * `lib/teacher/apply-validation.ts`'s `validateApplyInput` enforces at WRITE
 * time (a self-serve teacher can't save a `javascript:`/`data:` URL via the
 * apply wizard in the first place) — this is defense-in-depth against any
 * row that predates that check, was edited directly, or arrives via a future
 * admin edit path that doesn't reuse the validator. Exported for unit testing.
 */
export function isSafePhotoUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.length > 0 && isValidHttpUrl(url);
}

/**
 * Pure: whether a resolved slug's public page should render at all. Teacher
 * #1 is ALWAYS shown (see module header); every other teacher requires a
 * LIVE, `status = 'approved'` `teacher_profiles` row. Exported for unit
 * testing without a DB.
 */
export function shouldShowPublicPage(params: {
  isTeacherOne: boolean;
  profileStatus: TeacherProfile['status'] | null;
}): boolean {
  return params.isTeacherOne || params.profileStatus === 'approved';
}

/**
 * Pure: resolve the publicly-displayed identity fields (name/bio/photo),
 * overlaying a LIVE (`status = 'approved'`) `teacher_profiles` row on the
 * static `data/teachers.ts` fallback — an empty/absent live field (or a
 * non-approved profile) always falls back to the static one, never the
 * reverse. Exported for unit testing without a DB.
 */
export function resolvePublicIdentity(params: {
  staticDisplayName: string;
  staticBio: string;
  profile: TeacherProfile | null;
  locale: string;
}): { displayName: string; bio: string; photoUrl: string | null } {
  const live = params.profile?.status === 'approved' ? params.profile : null;
  const displayName = live?.displayName?.trim() || params.staticDisplayName;
  const liveBio = live ? (params.locale === 'ht' ? live.bioHt : live.bioFr)?.trim() : '';
  const bio = liveBio || params.staticBio;
  const photoUrl = live && isSafePhotoUrl(live.photoUrl) ? live.photoUrl : null;
  return { displayName, bio, photoUrl };
}

/**
 * Every `courses.slug` owned by `ownerUserId` (any status — the caller
 * intersects with `getPublishedCourses()` to keep only published ones).
 * GATED + FALLBACK: no DATABASE_URL or a failed query ⇒ `null` (the caller
 * then falls back to the static `courseSlugs` list), never throws.
 */
async function getOwnerCourseSlugs(ownerUserId: string): Promise<string[] | null> {
  if (!dbConfigured()) return null;
  try {
    const rows = await db
      .select({ slug: T.courses.slug })
      .from(T.courses)
      .where(eq(T.courses.ownerUserId, ownerUserId));
    return rows.map((r) => r.slug);
  } catch (err) {
    console.error('[teacher/public] getOwnerCourseSlugs DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * Distinct users with an ACTIVE `enrollments` row across the given course
 * slugs — mirrors the "enrolled" degeneracy already established in
 * lib/admin/data/real/courses.ts (`enrolledIdsFor`: active status, deduped
 * by user). GATED + FALLBACK: no DATABASE_URL, no slugs, or a failed query ⇒
 * `null` (never a misleading `0`) — the page renders the honest "—" it
 * already shows for `studentCount === null`.
 */
async function getDistinctStudentCount(courseSlugs: string[]): Promise<number | null> {
  if (!dbConfigured() || courseSlugs.length === 0) return null;
  try {
    const rows = await db
      .select({ userId: T.enrollments.userId })
      .from(T.enrollments)
      .where(and(inArray(T.enrollments.courseSlug, courseSlugs), eq(T.enrollments.status, 'active')));
    return new Set(rows.map((r) => r.userId)).size;
  } catch (err) {
    console.error('[teacher/public] getDistinctStudentCount DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * True only when `ownerUserId` has an ACTIVE `teacher_plans` row — gates the
 * $79 subscription block generically (no hardcoded slug/name check), per the
 * spec's "uniform, no special-casing" teacher model. GATED + FALLBACK: no
 * DATABASE_URL, no owner, or a failed query ⇒ `false`, never throws.
 */
async function hasActiveTeacherPlan(ownerUserId: string | null): Promise<boolean> {
  if (!dbConfigured() || !ownerUserId) return false;
  try {
    const [row] = await db
      .select({ id: T.teacherPlans.id })
      .from(T.teacherPlans)
      .where(and(eq(T.teacherPlans.ownerUserId, ownerUserId), eq(T.teacherPlans.status, 'active')))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    console.error('[teacher/public] hasActiveTeacherPlan DB read failed, falling back to false:', err);
    return false;
  }
}

/**
 * The full `/prof/[slug]` read (Task C3-T7). See the module header for the
 * slug-resolution + gating reasoning. GATED + NEVER-THROW: any DB read along
 * the way that fails degrades to its own documented fallback; the only ways
 * this returns `null` are an unknown slug or a resolved-but-not-approved
 * (and not teacher #1) profile — both of which the page turns into a 404.
 */
export async function getPublicTeacher(slug: string, locale: string): Promise<PublicTeacher | null> {
  const staticTeacher = getTeacher(slug);
  if (!staticTeacher) return null;

  const isTeacherOne = staticTeacher.slug === teachers[0]?.slug;

  // Resolve identity -> DB owner (same resolution the page used for the
  // rating alone since Task C3-T6) from any of the teacher's known slugs.
  const ownerUserId = await getTeacherOwnerUserId(staticTeacher.courseSlugs);
  const profile = ownerUserId ? await getTeacherProfile(ownerUserId) : null;

  if (!shouldShowPublicPage({ isTeacherOne, profileStatus: profile?.status ?? null })) {
    return null;
  }

  const ownerSlugs = ownerUserId ? await getOwnerCourseSlugs(ownerUserId) : null;
  const slugsForCourses = ownerSlugs ?? staticTeacher.courseSlugs;

  const [publishedAll, rating, studentCount, hasPlan] = await Promise.all([
    getPublishedCourses(),
    getTeacherRating(ownerUserId ?? ''),
    getDistinctStudentCount(slugsForCourses),
    // Teacher #1's fallback plan block has always rendered with no DB (see
    // header) — the real check only kicks in once an owner is resolvable.
    isTeacherOne ? Promise.resolve(true) : hasActiveTeacherPlan(ownerUserId),
  ]);

  const bySlug = new Map(publishedAll.map((c) => [c.slug, c]));
  const courses = slugsForCourses
    .map((s) => bySlug.get(s))
    .filter((c): c is Course => Boolean(c));

  const { displayName, bio, photoUrl } = resolvePublicIdentity({
    staticDisplayName: staticTeacher.displayName,
    staticBio: teacherBio(staticTeacher, locale),
    profile,
    locale,
  });

  return {
    slug: staticTeacher.slug,
    displayName,
    initials: staticTeacher.initials,
    imageName: staticTeacher.imageName,
    bio,
    photoUrl,
    docNo: teacherDocNo(staticTeacher),
    rating,
    courseCount: courses.length,
    studentCount,
    courses,
    joinedYear: staticTeacher.joinedYear,
    hasPlan,
  };
}
