/**
 * lib/home/source.ts — the homepage's data reads (Stage: the living
 * manifest). One rule governs everything here: the home page states only
 * what is TRUE. Every number is either a real DB read or is visibly derived
 * from the seeded/static content the site actually ships with — never
 * invented, never frozen marketing copy.
 *
 * GATED + NEVER-THROW throughout, mirroring lib/courses/source.ts /
 * lib/teacher/public.ts exactly: no DATABASE_URL, or a failed query ⇒ the
 * documented fallback (`null` for "we can't honestly claim a number",
 * static-registry values where those ARE the truth) — the homepage renders
 * degraded, never broken.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured, getPublishedCourses } from '@/lib/courses/source';
import { teachers as staticTeachers, getCourseTeacher } from '@/data/teachers';
import {
  rosterTeacherSlugs, getPublicTeacher,
  type PublicTeacher,
} from '@/lib/teacher/public';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import type { Course } from '@/data/courses';

const T = schema;

/** The manifest bar's live tallies. `null` = "not honestly claimable" (no DB). */
export type HomeStats = {
  /** Published catalogue size — DB-backed with the static-seed fallback. */
  courseCount: number;
  /** Static registry ∪ approved `teacher_profiles` slugs — real teachers only. */
  teacherCount: number;
  /** Distinct users with an ACTIVE enrollment, or `null` (no DB — never a fake 0-or-worse). */
  studentCount: number | null;
  /** Non-revoked certificates actually issued, or `null` (no DB). */
  certificateCount: number | null;
};

/**
 * The manifest bar's counts. Courses/teachers always resolve (their static
 * fallbacks ARE true statements about the seeded site); students/certificates
 * are DB-only claims and come back `null` — hidden, not faked — without one.
 */
export async function getHomeStats(): Promise<HomeStats> {
  // Same ONE roster rule as the rail below — this very stat printed
  // "2 anseyan" for one real person during the owner's teacher rename,
  // because it unioned static and DB slugs by string.
  const [courses, rosterSlugs] = await Promise.all([
    getPublishedCourses(),
    rosterTeacherSlugs(),
  ]);
  const teacherCount = rosterSlugs.length;

  let studentCount: number | null = null;
  let certificateCount: number | null = null;
  if (dbConfigured()) {
    try {
      const rows = await db
        .select({ userId: T.enrollments.userId })
        .from(T.enrollments)
        .where(eq(T.enrollments.status, 'active'));
      studentCount = new Set(rows.map((r) => r.userId)).size;
    } catch (err) {
      console.error('[home/source] student count DB read failed, falling back to null:', err);
    }
    try {
      const rows = await db
        .select({ id: T.certificates.id })
        .from(T.certificates)
        .where(eq(T.certificates.revoked, false));
      certificateCount = rows.length;
    } catch (err) {
      console.error('[home/source] certificate count DB read failed, falling back to null:', err);
    }
  }

  return { courseCount: courses.length, teacherCount, studentCount, certificateCount };
}

/** How many teacher cards the home rail shows before pointing at the full roster. */
const HOME_TEACHERS_LIMIT = 6;

/**
 * The teachers rail: the static registry (teacher #1) PLUS every approved
 * `teacher_profiles` slug, resolved through the exact same
 * `getPublicTeacher` read `/prof/[slug]` itself uses — so a card can never
 * show a teacher whose page would 404, and every field (live photo, real
 * rating, course count) matches their public page. Gated + never-throw all
 * the way down; no DB ⇒ just teacher #1's static card.
 */
export async function getHomeTeachers(locale: string): Promise<PublicTeacher[]> {
  // The ONE roster rule — DB truth when it exists, static only without a DB.
  // Never a merge of the two: merging by slug equality is what listed the
  // same person twice on the homepage during the owner's teacher rename
  // (see `rosterTeacherSlugs`'s header).
  const slugs = (await rosterTeacherSlugs()).slice(0, HOME_TEACHERS_LIMIT);
  const resolved = await Promise.all(slugs.map((slug) => getPublicTeacher(slug, locale)));
  return resolved.filter((t): t is PublicTeacher => Boolean(t));
}

export type TeacherChip = { name: string; slug: string };

/**
 * Teacher attribution for course cards, keyed by course slug. DB-first
 * (courses.owner_user_id → the owner's APPROVED teacher_profiles row, so a
 * 2nd+ real teacher's courses attribute correctly with zero code change),
 * overlaid on the static `data/teachers.ts` mapping as the fallback — the
 * same layering `getPublicTeacher` uses for identity. GATED + NEVER-THROW:
 * no DB or a failed query ⇒ the static mapping alone.
 */
export async function getCourseTeacherChips(
  courseSlugs: string[],
): Promise<Record<string, TeacherChip>> {
  const chips: Record<string, TeacherChip> = {};
  for (const slug of courseSlugs) {
    const staticTeacher = getCourseTeacher(slug);
    if (staticTeacher) chips[slug] = { name: staticTeacher.displayName, slug: staticTeacher.slug };
  }
  if (!dbConfigured() || courseSlugs.length === 0) return chips;
  try {
    const rows = await db
      .select({ slug: T.courses.slug, ownerUserId: T.courses.ownerUserId })
      .from(T.courses)
      .where(inArray(T.courses.slug, courseSlugs));
    const owners = [...new Set(rows.map((r) => r.ownerUserId).filter((o): o is string => Boolean(o)))];
    if (owners.length === 0) return chips;
    const profiles = await db
      .select({
        userId: T.teacherProfiles.userId,
        slug: T.teacherProfiles.slug,
        displayName: T.teacherProfiles.displayName,
      })
      .from(T.teacherProfiles)
      .where(and(inArray(T.teacherProfiles.userId, owners), eq(T.teacherProfiles.status, 'approved')));
    const byOwner = new Map(profiles.map((p) => [p.userId, p]));
    for (const row of rows) {
      const profile = row.ownerUserId ? byOwner.get(row.ownerUserId) : undefined;
      if (profile?.slug && profile.displayName?.trim()) {
        chips[row.slug] = { name: profile.displayName.trim(), slug: profile.slug };
      }
    }
    return chips;
  } catch (err) {
    console.error('[home/source] teacher chips DB read failed, falling back to static:', err);
    return chips;
  }
}

export type PlanExample = { name: string; slug: string; priceCentsMonthly: number };

/**
 * Pure: the pricing triptych's REAL example for "Pass yon anseyan" — the
 * first railed teacher with an active pass. A teacher whose `plan` is null
 * while `hasPlan` is true is exactly the teacher-#1-no-DB fallback
 * (lib/teacher/public.ts's header): the platform constant genuinely IS what
 * a purchase would charge there (lib/payments/products.ts's own no-DB
 * fallback), so it's the honest example price too — the same reasoning
 * /prof/[slug] applies. No teacher with a pass ⇒ `null` (the card renders
 * without an example, never an invented one). Exported for unit testing.
 */
export function pickPlanExample(
  teachers: Pick<PublicTeacher, 'displayName' | 'slug' | 'hasPlan' | 'plan'>[],
): PlanExample | null {
  const teacher = teachers.find((t) => t.hasPlan);
  if (!teacher) return null;
  return {
    name: teacher.displayName,
    slug: teacher.slug,
    priceCentsMonthly: teacher.plan?.priceCentsMonthly ?? SUBSCRIPTION_USD * 100,
  };
}

/**
 * Pure: the lowest published course price, for the honest « Depi $X » line
 * on the à-l'unité card — `null` when the catalogue is empty (render no
 * price rather than a made-up one). Exported for unit testing.
 */
export function minCoursePriceUsd(courses: Pick<Course, 'priceUsd'>[]): number | null {
  const prices = courses.map((c) => c.priceUsd).filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}
