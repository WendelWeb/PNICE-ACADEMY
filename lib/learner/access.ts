/**
 * Learner access + progress reads (Drizzle) — Task L1 (buy → learn), UPDATED
 * by Task: two subscription products.
 *
 * Access model (BINDING — supersedes the pre-marketplace note that used to
 * live here, which assumed a single $79 pass unlocked every course; that
 * assumption broke once teachers set their own prices — see
 * docs/superpowers/specs/2026-07-22-marketplace-design.md): a signed-in user
 * has access to a course's lessons if ANY of:
 *   (a) an active `enrollments` row for that course_slug (unchanged), OR
 *   (b) an active `subscriptions` row whose `kind` covers this course:
 *       - `kind = 'platform'` (the "Pass PNICE" all-access pass, owner-priced
 *         via lib/platformPrice.ts) → every course, exactly like today.
 *       - `kind = 'teacher'` (a specific teacher's own pass, priced via that
 *         teacher's `teacher_plans` row) → ONLY courses owned by THAT
 *         teacher (`courses.owner_user_id`, resolved through the
 *         subscription's `teacher_plan_id` → `teacher_plans.owner_user_id` —
 *         the same course→teacher link lib/teacher/earnings.ts's
 *         `resolveTeacherUserId` and lib/teacher/public.ts's
 *         `getOwnerCourseSlugs` already use).
 * `subscriptions.kind` is an explicit column (db/schema.ts), never inferred
 * from `teacher_plan_id` being null — see that column's own migration
 * comment for why pre-migration rows are grandfathered to 'platform'.
 * Free-preview lessons are handled by the LESSON PAGE itself (data/courses.ts
 * `isPreviewLesson`), not here — a course can be previewed with no access at
 * all.
 *
 * Every export is safe to call with no DATABASE_URL, Clerk disabled, signed
 * out, or no matching `users` row — it degrades to an empty/false result and
 * NEVER throws, mirroring the DB-read pattern in lib/admin/data/real/users.ts
 * and the "no DB ⇒ empty state" constraint from the launch-code plan.
 *
 * Course data (lesson counts) comes from `lib/courses/source.ts` (Task
 * C2-T3, gated + fallback to the static catalog) via `getAllCourses()` —
 * NOT `getPublishedCourses()`: a learner keeps access to a course they
 * already bought/subscribed to even if it's later unpublished/archived.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, schema, isMissingColumnError } from '@/db';
import { getAllCourses } from '@/lib/courses/source';
import { clerkEnabled } from '@/lib/clerk';

const T = schema;

/** An active subscription's shape, as far as access resolution cares. */
export type SubscriptionGrant = {
  kind: 'teacher' | 'platform';
  teacherPlanId: string | null;
};

/**
 * Every active `subscriptions` row for `userId`, as `SubscriptionGrant`s.
 * Money-critical migration-lag guard (Task: two subscription products,
 * db/migrations/0015): unlike lib/payments/fulfill.ts's own retry (a
 * webhook Stripe will redeliver), a live DB that still lags a migration here
 * would make EVERY existing subscriber's access check throw, get caught by
 * the caller's outer try/catch, and resolve to "no access" — locking every
 * paying subscriber out of courses they already have access to. Verified
 * against a live DB that turned out to lag TWO migrations at once (missing
 * both `kind` from this task AND `teacher_plan_id` from the earlier
 * per-teacher-checkout task) — so this retries in TWO steps, dropping one
 * column at a time, rather than assuming only the newest migration is ever
 * missing. Each fallback tier defaults the columns it can't read to the
 * SAME grandfather values those columns' own schema defaults would produce
 * once every migration lands ('platform' kind, no specific plan) — access
 * degrades to "as if universal" during the gap, never to "locked out".
 */
async function getActiveSubscriptions(userId: string): Promise<SubscriptionGrant[]> {
  const where = and(eq(T.subscriptions.userId, userId), eq(T.subscriptions.status, 'active'));
  try {
    return await db
      .select({ kind: T.subscriptions.kind, teacherPlanId: T.subscriptions.teacherPlanId })
      .from(T.subscriptions)
      .where(where);
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
  }
  console.warn(
    '[learner/access] subscriptions read fell back — no `kind` column — run `npm run db:push`.',
  );
  try {
    const rows = await db
      .select({ teacherPlanId: T.subscriptions.teacherPlanId })
      .from(T.subscriptions)
      .where(where);
    return rows.map((r) => ({ kind: 'platform' as const, teacherPlanId: r.teacherPlanId }));
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
  }
  console.warn(
    '[learner/access] subscriptions read fell back further — no `teacher_plan_id` column either — run `npm run db:push`.',
  );
  const rows = await db.select({ id: T.subscriptions.id }).from(T.subscriptions).where(where);
  return rows.map(() => ({ kind: 'platform' as const, teacherPlanId: null }));
}

/**
 * Pure: does this set of active subscriptions cover a course owned by
 * `courseOwnerUserId`? `planOwnerByPlanId` maps each 'teacher'-kind
 * subscription's `teacherPlanId` to its plan's `owner_user_id` (resolved by
 * the caller — a DB read). Exported for unit testing without a DB — this is
 * the ONE place the "which pass covers which course" rule is decided.
 */
export function subscriptionsGrantCourse(
  subs: SubscriptionGrant[],
  courseOwnerUserId: string | null,
  planOwnerByPlanId: Map<string, string>,
): boolean {
  if (subs.some((s) => s.kind === 'platform')) return true;
  if (!courseOwnerUserId) return false;
  return subs.some(
    (s) => s.kind === 'teacher' && s.teacherPlanId && planOwnerByPlanId.get(s.teacherPlanId) === courseOwnerUserId,
  );
}

/**
 * Pure: every course slug this set of active subscriptions covers, given
 * `allCourseSlugs` (every known slug — what a 'platform' pass grants) and
 * `ownerSlugsByOwnerId` (owner_user_id → their course slugs, resolved by the
 * caller). Exported for unit testing without a DB.
 */
export function subscriptionAccessibleSlugs(
  subs: SubscriptionGrant[],
  allCourseSlugs: string[],
  ownerSlugsByOwnerId: Map<string, string[]>,
  planOwnerByPlanId: Map<string, string>,
): Set<string> {
  if (subs.some((s) => s.kind === 'platform')) return new Set(allCourseSlugs);
  const slugs = new Set<string>();
  for (const s of subs) {
    if (s.kind !== 'teacher' || !s.teacherPlanId) continue;
    const ownerId = planOwnerByPlanId.get(s.teacherPlanId);
    if (!ownerId) continue;
    for (const slug of ownerSlugsByOwnerId.get(ownerId) ?? []) slugs.add(slug);
  }
  return slugs;
}

/** `teacher_plans.id` → its `owner_user_id`, for the given plan ids only.
 *  Skips ids with no resolvable owner. Never throws on its own — callers
 *  already run inside a try/catch. */
async function planOwnerMap(teacherPlanIds: string[]): Promise<Map<string, string>> {
  if (teacherPlanIds.length === 0) return new Map();
  const rows = await db
    .select({ id: T.teacherPlans.id, ownerUserId: T.teacherPlans.ownerUserId })
    .from(T.teacherPlans)
    .where(inArray(T.teacherPlans.id, teacherPlanIds));
  const map = new Map<string, string>();
  for (const r of rows) if (r.ownerUserId) map.set(r.id, r.ownerUserId);
  return map;
}

/** `owner_user_id` → every course slug they own, for the given owner ids
 *  only. Never throws on its own — callers already run inside a try/catch. */
async function ownerCourseSlugsMap(ownerIds: string[]): Promise<Map<string, string[]>> {
  if (ownerIds.length === 0) return new Map();
  const rows = await db
    .select({ slug: T.courses.slug, ownerUserId: T.courses.ownerUserId })
    .from(T.courses)
    .where(inArray(T.courses.ownerUserId, ownerIds));
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.ownerUserId) continue;
    const arr = map.get(r.ownerUserId) ?? [];
    arr.push(r.slug);
    map.set(r.ownerUserId, arr);
  }
  return map;
}

export type MyCourse = {
  slug: string;
  lessonsDone: number;
  lessonsTotal: number;
  /** 1-based lesson index to resume at — min(lessonsDone + 1, lessonsTotal). */
  lastLessonIndex: number;
};

/** True only when a real DB read is actually possible. */
function dbReady(): boolean {
  return Boolean(process.env.DATABASE_URL) && clerkEnabled;
}

/** clerkId → users.id. Null if no DB row exists yet (e.g. webhook hasn't synced). */
export async function resolveUserId(clerkId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: T.users.id })
    .from(T.users)
    .where(eq(T.users.clerkId, clerkId))
    .limit(1);
  return row?.id ?? null;
}

export async function getMyLearning(
  clerkId: string,
): Promise<{ courses: MyCourse[]; hasSubscription: boolean }> {
  const empty = { courses: [], hasSubscription: false };
  if (!dbReady() || !clerkId) return empty;

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return empty;

    const [enrolls, subs, prog] = await Promise.all([
      db
        .select()
        .from(T.enrollments)
        .where(and(eq(T.enrollments.userId, userId), eq(T.enrollments.status, 'active'))),
      getActiveSubscriptions(userId),
      db.select().from(T.progress).where(eq(T.progress.userId, userId)),
    ]);

    const hasSubscription = subs.length > 0;
    const enrolledSlugs = new Set(enrolls.map((e) => e.courseSlug));

    // Which course slugs the learner's active subscription(s) actually cover
    // (Task: two subscription products) — a 'platform' pass covers every
    // course; a 'teacher' pass covers only that teacher's own courses. Empty
    // when `subs` is empty (no extra queries fired).
    const teacherPlanIds = subs.map((s) => s.teacherPlanId).filter((id): id is string => Boolean(id));
    const planOwners = await planOwnerMap(teacherPlanIds);
    const ownerIds = [...new Set([...planOwners.values()])];
    const ownerSlugs = await ownerCourseSlugsMap(ownerIds);

    const courses = await getAllCourses();
    const allCourseSlugs = courses.map((c) => c.slug);
    const subscriptionSlugs = subscriptionAccessibleSlugs(subs, allCourseSlugs, ownerSlugs, planOwners);

    // A subscriber has access to every course THEIR SUBSCRIPTION COVERS with
    // no per-course enrollment row, so a course they've actually made
    // progress in (but never bought individually) must still surface here —
    // otherwise their real activity would be invisible on their own
    // dashboard. Scoped to `subscriptionSlugs` (not "any subscription at
    // all") so a teacher-pass holder's dashboard can't leak progress on a
    // course outside that pass. Individually-enrolled courses always show,
    // even at 0 progress (mirrors the pre-L1 demo's done:0 entry for a
    // freshly-bought course).
    const progressSlugs = prog.filter((p) => p.completedAt).map((p) => p.courseSlug);
    const slugs = new Set([
      ...enrolledSlugs,
      ...progressSlugs.filter((slug) => subscriptionSlugs.has(slug)),
    ]);

    const courseBySlug = new Map(courses.map((c) => [c.slug, c]));

    const result: MyCourse[] = [];
    for (const slug of slugs) {
      const course = courseBySlug.get(slug);
      if (!course) continue; // stale/unknown slug — skip defensively
      const lessonsTotal = course.lessons.length;
      const lessonsDone = prog.filter((p) => p.courseSlug === slug && p.completedAt).length;
      result.push({
        slug,
        lessonsDone,
        lessonsTotal,
        lastLessonIndex: Math.min(lessonsDone + 1, Math.max(lessonsTotal, 1)),
      });
    }
    return { courses: result, hasSubscription };
  } catch (err) {
    console.error('[learner/access] getMyLearning failed:', err);
    return empty;
  }
}

export async function hasCourseAccess(clerkId: string, courseSlug: string): Promise<boolean> {
  if (!dbReady() || !clerkId) return false;

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return false;

    const [enrollment] = await db
      .select({ id: T.enrollments.id })
      .from(T.enrollments)
      .where(
        and(
          eq(T.enrollments.userId, userId),
          eq(T.enrollments.courseSlug, courseSlug),
          eq(T.enrollments.status, 'active'),
        ),
      )
      .limit(1);
    if (enrollment) return true;

    const subs = await getActiveSubscriptions(userId);
    if (subs.length === 0) return false;
    if (subs.some((s) => s.kind === 'platform')) return true;

    // Every remaining active subscription is 'teacher'-kind — only grants
    // this course if one of them belongs to THIS course's own owner (Task:
    // two subscription products).
    const teacherPlanIds = subs.map((s) => s.teacherPlanId).filter((id): id is string => Boolean(id));
    const [course] = await db
      .select({ ownerUserId: T.courses.ownerUserId })
      .from(T.courses)
      .where(eq(T.courses.slug, courseSlug))
      .limit(1);
    const planOwners = await planOwnerMap(teacherPlanIds);
    return subscriptionsGrantCourse(subs, course?.ownerUserId ?? null, planOwners);
  } catch (err) {
    console.error('[learner/access] hasCourseAccess failed:', err);
    return false;
  }
}

/**
 * If `clerkId` holds an active 'teacher'-kind subscription, the FIRST one's
 * teacher (owner id + a best-effort display name) — used by the lesson page
 * to explain "you already have X's pass, it doesn't cover this course"
 * instead of a silent dead-end (Task: two subscription products) whenever
 * `hasCourseAccess` returns `false` for a learner who still holds SOME
 * active subscription. `null` when there's no active teacher-kind
 * subscription, or its plan/owner no longer resolves. GATED + NEVER-THROW.
 */
export async function getActiveTeacherPassOwner(
  clerkId: string,
): Promise<{ ownerUserId: string; displayName: string } | null> {
  if (!dbReady() || !clerkId) return null;
  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return null;

    const subs = await getActiveSubscriptions(userId);
    const teacherSub = subs.find((s) => s.kind === 'teacher' && s.teacherPlanId);
    if (!teacherSub?.teacherPlanId) return null;

    const [plan] = await db
      .select({ ownerUserId: T.teacherPlans.ownerUserId })
      .from(T.teacherPlans)
      .where(eq(T.teacherPlans.id, teacherSub.teacherPlanId))
      .limit(1);
    if (!plan?.ownerUserId) return null;

    const displayName = await resolveOwnerDisplayName(plan.ownerUserId);
    return { ownerUserId: plan.ownerUserId, displayName };
  } catch (err) {
    console.error('[learner/access] getActiveTeacherPassOwner failed:', err);
    return null;
  }
}

/** Best-effort `teacher_profiles.display_name` lookup by owner id — falls
 *  back to the same generic 'Anseyan' ("teacher" in Kreyòl) label
 *  lib/teacher/public.ts's own resolvers use when a live name can't be
 *  read. Never throws. */
async function resolveOwnerDisplayName(ownerUserId: string): Promise<string> {
  try {
    const [row] = await db
      .select({ displayName: T.teacherProfiles.displayName })
      .from(T.teacherProfiles)
      .where(eq(T.teacherProfiles.userId, ownerUserId))
      .limit(1);
    const live = row?.displayName?.trim();
    if (live) return live;
  } catch (err) {
    console.error('[learner/access] resolveOwnerDisplayName DB read failed:', err);
  }
  return 'Anseyan';
}

export async function getCourseProgress(
  clerkId: string,
  courseSlug: string,
): Promise<Set<number>> {
  if (!dbReady() || !clerkId) return new Set();

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return new Set();

    const rows = await db
      .select({ lessonIndex: T.progress.lessonIndex })
      .from(T.progress)
      .where(
        and(
          eq(T.progress.userId, userId),
          eq(T.progress.courseSlug, courseSlug),
          isNotNull(T.progress.completedAt),
        ),
      );
    return new Set(rows.map((r) => r.lessonIndex));
  } catch (err) {
    console.error('[learner/access] getCourseProgress failed:', err);
    return new Set();
  }
}
