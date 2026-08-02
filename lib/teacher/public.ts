/**
 * lib/teacher/public.ts — the public `/prof/[slug]` read (Task C3-T7).
 * Companion to lib/teacher/profile.ts (the authenticated studio reads) —
 * this module is the PUBLIC-FACING counterpart: one gated, never-throw
 * `getPublicTeacher(slug, locale)` that resolves everything the page needs.
 *
 * SLUG RESOLUTION (Task: DB-backed teacher slugs — supersedes the v1 note
 * that used to live here): `data/teachers.ts` is still consulted FIRST — a
 * slug it knows (teacher #1 today) takes the exact same code path as before
 * this task, so teacher #1's page stays byte-identical even now that their
 * `teacher_profiles.slug` ALSO carries 'pnice-academy' (see
 * scripts/seed-courses.ts). Only when the static registry doesn't recognise
 * the slug do we fall through to `teacher_profiles.slug` (approved rows
 * only) — this is what lets a 2nd+ real teacher (approved via
 * lib/teacher/admin.ts's `approveTeacherProfile`, which generates their
 * slug) get a working public page with ZERO code change. Still unknown to
 * both ⇒ `null`, always (404).
 *
 * A DB-only teacher (no static registry entry) has no `initials`/
 * `imageName`/`joinedYear`/`docNo` to draw on — those are synthesized
 * (see `getPublicTeacherFromDbSlug`): initials from their display name,
 * a generic branded placeholder image, and a doc number/joined-year derived
 * from their profile's `created_at`.
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
import { getTeacherProfile, mapDbTeacherProfile, type TeacherProfile } from '@/lib/teacher/profile';
import { getTeacherOwnerUserId, getTeacherRating, type RatingSummary } from '@/lib/reviews/reviews';
import { isValidHttpUrl } from '@/lib/teacher/apply-validation';
import { SUBSCRIPTION_USD } from '@/data/pricing';

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
  /** Whether this teacher has an active `teacher_plan` (their monthly all-access pass) — gates the subscription block. */
  hasPlan: boolean;
  /**
   * The active plan's real id + price, when resolvable (Task: per-teacher
   * subscription checkout / real plan price on `/prof/[slug]`) — `null`
   * whenever `hasPlan` is true only via the teacher-#1 no-DB fallback (see
   * `getPublicTeacher`), since there is no live row to read a real price
   * from. Renderers must fall back to `SUBSCRIPTION_USD` in that case,
   * exactly like every other "no DB ⇒ constant" fallback in this codebase.
   */
  plan: { id: string; priceCentsMonthly: number } | null;
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
 * Pure: seal initials for a teacher with no `data/teachers.ts` registry
 * entry (a DB-only teacher, Task: DB-backed teacher slugs) — up to the first
 * two "words" of their display name, uppercased. Falls back to '??' for an
 * empty/whitespace-only name (shouldn't happen for an approved profile,
 * which requires a non-empty `display_name` at apply time, but never throws
 * either way). Exported for unit testing.
 */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  const initials = words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return initials || '??';
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
 * `ownerUserId`'s ACTIVE `teacher_plans` row (id + effective price), or
 * `null` — gates the subscription block generically (no hardcoded slug/name
 * check), per the spec's "uniform, no special-casing" teacher model, and
 * supplies the REAL price `/prof/[slug]` renders (Task: real plan price
 * instead of a hardcoded $79). A row with no `price_cents_monthly` set
 * (shouldn't happen via the studio form, but the column is nullable) falls
 * back to the platform default — mirrors the studio page's own
 * `myPlan?.priceCentsMonthly ?? SUBSCRIPTION_USD * 100`. GATED + FALLBACK: no
 * DATABASE_URL, no owner, or a failed query ⇒ `null`, never throws.
 */
async function getActiveTeacherPlan(
  ownerUserId: string | null,
): Promise<{ id: string; priceCentsMonthly: number } | null> {
  if (!dbConfigured() || !ownerUserId) return null;
  try {
    const [row] = await db
      .select({ id: T.teacherPlans.id, priceCentsMonthly: T.teacherPlans.priceCentsMonthly })
      .from(T.teacherPlans)
      .where(and(eq(T.teacherPlans.ownerUserId, ownerUserId), eq(T.teacherPlans.status, 'active')))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      priceCentsMonthly:
        typeof row.priceCentsMonthly === 'number' && row.priceCentsMonthly > 0
          ? row.priceCentsMonthly
          : SUBSCRIPTION_USD * 100,
    };
  } catch (err) {
    console.error('[teacher/public] getActiveTeacherPlan DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * `slug` → the teacher's `users.id`, using the EXACT same resolution order
 * `getPublicTeacher` itself uses (static `data/teachers.ts` registry first,
 * then an APPROVED `teacher_profiles.slug`) — shared by
 * `lib/payments/products.ts`'s per-teacher subscription checkout (Task:
 * per-teacher subscription checkout) so "who does this slug belong to" is
 * answered identically everywhere a purchase or a public page needs it.
 * GATED + NEVER-THROW: no DATABASE_URL, unknown/non-approved slug, or a
 * failed query ⇒ `null`.
 */
export async function resolveTeacherOwnerUserIdBySlug(slug: string): Promise<string | null> {
  const staticTeacher = getTeacher(slug);
  if (staticTeacher) return getTeacherOwnerUserId(staticTeacher.courseSlugs);
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .select({ userId: T.teacherProfiles.userId })
      .from(T.teacherProfiles)
      .where(and(eq(T.teacherProfiles.slug, slug), eq(T.teacherProfiles.status, 'approved')))
      .limit(1);
    return row?.userId ?? null;
  } catch (err) {
    console.error('[teacher/public] resolveTeacherOwnerUserIdBySlug DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * Every slug from an APPROVED `teacher_profiles` row (Task: DB-backed
 * teacher slugs) — used by `/prof/[slug]`'s `generateStaticParams` to
 * pre-render real teachers' pages alongside the static `data/teachers.ts`
 * ones. GATED + FALLBACK: no DATABASE_URL or a failed query ⇒ `[]`, never
 * throws — build-time pre-rendering simply falls back to the static list.
 */
export async function getApprovedTeacherSlugs(): Promise<string[]> {
  if (!dbConfigured()) return [];
  try {
    const rows = await db
      .select({ slug: T.teacherProfiles.slug })
      .from(T.teacherProfiles)
      .where(eq(T.teacherProfiles.status, 'approved'));
    return rows.map((r) => r.slug).filter((s): s is string => Boolean(s));
  } catch (err) {
    console.error('[teacher/public] getApprovedTeacherSlugs DB read failed, falling back to []:', err);
    return [];
  }
}

/**
 * DB-ONLY teacher resolution (Task: DB-backed teacher slugs) — reached only
 * when `slug` isn't in the static `data/teachers.ts` registry (see
 * `getPublicTeacher` below). Resolves an APPROVED `teacher_profiles` row by
 * `slug` directly (no `data/teachers.ts` counterpart needed — this is
 * exactly what lets a 2nd+ real teacher get a public page with zero code
 * change), then builds the same `PublicTeacher` shape a static-registry
 * teacher gets, synthesizing the fields that only exist in the static
 * registry today (initials from the display name, a generic branded
 * placeholder image, a doc number/joined-year derived from `created_at`).
 * GATED + NEVER-THROW: no DATABASE_URL, no matching APPROVED row, or a
 * failed query ⇒ `null` (404), matching every other path here.
 */
async function getPublicTeacherFromDbSlug(slug: string, locale: string): Promise<PublicTeacher | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .select()
      .from(T.teacherProfiles)
      .where(and(eq(T.teacherProfiles.slug, slug), eq(T.teacherProfiles.status, 'approved')))
      .limit(1);
    if (!row) return null;
    const profile = mapDbTeacherProfile(row);
    const ownerUserId = profile.userId;

    const [ownerSlugs, rating, activePlan, publishedAll] = await Promise.all([
      getOwnerCourseSlugs(ownerUserId),
      getTeacherRating(ownerUserId),
      getActiveTeacherPlan(ownerUserId),
      getPublishedCourses(),
    ]);
    const slugsForCourses = ownerSlugs ?? [];
    const studentCount = await getDistinctStudentCount(slugsForCourses);

    const bySlug = new Map(publishedAll.map((c) => [c.slug, c]));
    const courses = slugsForCourses
      .map((s) => bySlug.get(s))
      .filter((c): c is Course => Boolean(c));

    // An approved profile always has a non-empty display_name (required at
    // apply time) — the 'Anseyan' ("teacher" in Kreyòl) fallback is defensive
    // only, never expected to actually render.
    const displayName = profile.displayName?.trim() || 'Anseyan';
    const bio = (locale === 'ht' ? profile.bioHt : profile.bioFr)?.trim() || '';
    const photoUrl = isSafePhotoUrl(profile.photoUrl) ? profile.photoUrl : null;
    const joinedYear = new Date(profile.createdAt).getFullYear();

    return {
      slug,
      displayName,
      initials: initialsFromName(displayName),
      // Generic branded placeholder — teacher #1 has a dedicated founder.*
      // asset, but a DB-only teacher (no static registry entry) has none
      // yet; reuses an existing on-brand illustration rather than a broken
      // image path. Only shown when `photoUrl` is null (no live photo).
      imageName: 'avatars/avatar-1',
      bio,
      photoUrl,
      docNo: `ANS-${joinedYear}-${profile.id.slice(0, 3).toUpperCase()}`,
      rating,
      courseCount: courses.length,
      studentCount,
      courses,
      joinedYear,
      hasPlan: Boolean(activePlan),
      plan: activePlan,
    };
  } catch (err) {
    console.error('[teacher/public] getPublicTeacherFromDbSlug DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * The full `/prof/[slug]` read (Task C3-T7, extended by Task: DB-backed
 * teacher slugs). See the module header for the slug-resolution + gating
 * reasoning. GATED + NEVER-THROW: any DB read along the way that fails
 * degrades to its own documented fallback; the only ways this returns
 * `null` are an unknown slug (in both registries) or a resolved-but-not-
 * approved (and not teacher #1) profile — both of which the page turns into
 * a 404.
 */
export async function getPublicTeacher(slug: string, locale: string): Promise<PublicTeacher | null> {
  const staticTeacher = getTeacher(slug);
  if (!staticTeacher) return getPublicTeacherFromDbSlug(slug, locale);

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

  const [publishedAll, rating, studentCount, activePlan] = await Promise.all([
    getPublishedCourses(),
    getTeacherRating(ownerUserId ?? ''),
    getDistinctStudentCount(slugsForCourses),
    getActiveTeacherPlan(ownerUserId),
  ]);
  // Teacher #1's fallback plan block has always rendered with no DB (see
  // header) even with no resolvable owner/plan row — `plan` stays `null` in
  // that exact case (no live row to read a real price from), so renderers
  // fall back to the platform constant exactly like every other "no DB ⇒
  // constant" path in this codebase.
  const hasPlan = isTeacherOne || Boolean(activePlan);

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
    plan: activePlan,
  };
}
