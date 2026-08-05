/**
 * Real (Drizzle) Engagement domain (Task L2c) — same "load everything, filter
 * in JS" style as ./users.ts (loadAll). The mock (`lib/admin/data/mock/index.ts`,
 * the `courseProgress` helper + getCourseCompletion/getCourseTimes/
 * getLessonViews/getAggregateDropoff/getActiveLearners/getStuckUsers) is the
 * reference for every method's exact shape and semantics; this file reproduces
 * that behaviour from real rows.
 *
 * Two schema-driven adaptations, both DOCUMENTED DEGENERACIES rather than
 * reinterpretations of the mock's intent:
 *
 * 1. "Enrolled" for a course = distinct users with an ACTIVE `enrollments` row
 *    for that course_slug — mirrors the precedent already set by
 *    real/users.ts's `coursesAccess` (which also treats `enrollments` as the
 *    per-course record, distinct from blanket subscription access, e.g.
 *    `isSubscriber ? courses.length : new Set(myEnrolls...)`). A subscriber
 *    who takes a course without ever buying/being granted it individually has
 *    NO enrollments row for it, so they will not appear in these per-course
 *    stats even though they have platform access — this under-counts on a DB
 *    where most access comes from the $79 subscription rather than
 *    à-l'unité/admin-granted purchases. Degrades to 0/empty gracefully.
 *
 * 2. `progress` is a PER-LESSON row model (userId, courseSlug, lessonIndex,
 *    completedAt), not the mock's per-(user,course) aggregate counter. Every
 *    function reconstructs the aggregate ("lessonsDone" = count of rows with
 *    completedAt set, "lastActivityAt" = latest updatedAt) the same way
 *    real/users.ts's `enrichUser` derives `lastActiveAt` (rows with
 *    completedAt OR lastPositionSeconds > 0 count as activity).
 *
 * On a near-empty DB (no progress/enrollments yet) every method here returns
 * the same empty/zeroed shape the mock would for an empty dataset — never
 * throws.
 */
import { db, schema } from '@/db';
import { getAllCourses } from '@/lib/courses/source';
import type { Course } from '@/data/courses';
import type {
  ActiveLearnerRow,
  CourseCompletionRow,
  CourseTimeRow,
  DropoffPoint,
  EngagementQuery,
  LessonViewRow,
  StuckUserRow,
} from '../types';

const T = schema;
const DAY = 86_400_000;

type DbEnroll = typeof T.enrollments.$inferSelect;
type DbProgress = typeof T.progress.$inferSelect;

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

/** Mirrors the mock's `median` helper exactly (see mock/index.ts). */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function loadBase() {
  const [users, payments, subs, enrolls, prog, courses] = await Promise.all([
    db.select().from(T.users),
    db.select().from(T.payments),
    db.select().from(T.subscriptions),
    db.select().from(T.enrollments),
    db.select().from(T.progress),
    // DB-first, static-fallback (Stage 7 fix: this used to be the static
    // `data/courses.ts` array, so a DB-authored teacher course was silently
    // absent from every course-level engagement report below).
    getAllCourses(),
  ]);
  return { users, payments, subs, enrolls, prog, courses };
}

/** Distinct userIds with an active per-course enrollment for `slug` — see the
 *  file-level note on the "enrolled" deviation. */
function enrolledIdsFor(slug: string, enrolls: DbEnroll[]): string[] {
  return [
    ...new Set(
      enrolls.filter((e) => e.courseSlug === slug && e.status === 'active').map((e) => e.userId),
    ),
  ];
}

/** userId -> courseSlug -> completed-lesson count (progress rows with completedAt set). */
function buildDoneMap(prog: DbProgress[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const p of prog) {
    if (!p.completedAt) continue;
    let byCourse = m.get(p.userId);
    if (!byCourse) {
      byCourse = new Map();
      m.set(p.userId, byCourse);
    }
    byCourse.set(p.courseSlug, (byCourse.get(p.courseSlug) ?? 0) + 1);
  }
  return m;
}
function doneCount(m: Map<string, Map<string, number>>, userId: string, slug: string): number {
  return m.get(userId)?.get(slug) ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Course-level stats (Tasks 1–4 of the mock's Lot 3)                          */
/* -------------------------------------------------------------------------- */

export async function getCourseCompletion(): Promise<CourseCompletionRow[]> {
  const { enrolls, prog, courses } = await loadBase();
  const doneMap = buildDoneMap(prog);
  return courses.map((c) => {
    const enrolledIds = enrolledIdsFor(c.slug, enrolls);
    const enrolled = enrolledIds.length;
    const startedCount = enrolledIds.filter((id) => doneCount(doneMap, id, c.slug) > 0).length;
    const completedCount = enrolledIds.filter(
      (id) => doneCount(doneMap, id, c.slug) >= c.lessons.length,
    ).length;
    return {
      slug: c.slug,
      code: c.code,
      title_fr: c.title_fr,
      title_ht: c.title_ht,
      enrolled,
      startedCount,
      completedCount,
      completionRatePct: enrolled ? (completedCount / enrolled) * 100 : 0,
      lessonsCount: c.lessons.length,
    };
  });
}

export async function getCourseTimes(): Promise<CourseTimeRow[]> {
  const { enrolls, prog, courses } = await loadBase();
  return courses.map((c) => {
    const enrolledAtByUser = new Map<string, string>();
    for (const e of enrolls) {
      if (e.courseSlug === c.slug && e.status === 'active') {
        enrolledAtByUser.set(e.userId, iso(e.purchasedAt)!);
      }
    }
    const doneByUser = new Map<string, number>();
    const lastByUser = new Map<string, string>();
    for (const p of prog) {
      if (p.courseSlug !== c.slug || !p.completedAt) continue;
      doneByUser.set(p.userId, (doneByUser.get(p.userId) ?? 0) + 1);
      const t = iso(p.updatedAt)!;
      const cur = lastByUser.get(p.userId);
      if (!cur || t > cur) lastByUser.set(p.userId, t);
    }
    const days: number[] = [];
    for (const [userId, done] of doneByUser) {
      if (done < c.lessons.length) continue;
      const enrolledAt = enrolledAtByUser.get(userId);
      if (!enrolledAt) continue;
      const lastActivityAt = lastByUser.get(userId)!;
      days.push(Math.max(0, (Date.parse(lastActivityAt) - Date.parse(enrolledAt)) / DAY));
    }
    return {
      slug: c.slug,
      code: c.code,
      title_fr: c.title_fr,
      title_ht: c.title_ht,
      completers: days.length,
      medianDays: Math.round(median(days)),
      meanDays: Math.round(days.reduce((a, b) => a + b, 0) / (days.length || 1)),
    };
  });
}

export async function getLessonViews(): Promise<{ top: LessonViewRow[]; bottom: LessonViewRow[] }> {
  const { enrolls, prog, courses } = await loadBase();
  const doneMap = buildDoneMap(prog);
  const all: LessonViewRow[] = [];
  for (const c of courses) {
    const enrolledIds = enrolledIdsFor(c.slug, enrolls);
    const enrolled = enrolledIds.length;
    c.lessons.forEach((lesson, i) => {
      // Reached/opened lesson i = lessonsDone >= i (consistent with course-detail drop-off).
      const views = enrolledIds.filter((id) => doneCount(doneMap, id, c.slug) >= i).length;
      all.push({
        slug: c.slug,
        code: c.code,
        courseTitle_fr: c.title_fr,
        courseTitle_ht: c.title_ht,
        lessonIndex: i,
        lessonTitle_fr: lesson.title_fr,
        lessonTitle_ht: lesson.title_ht,
        views,
        enrolled,
        abandonPct: enrolled ? ((enrolled - views) / enrolled) * 100 : 0,
      });
    });
  }
  return {
    top: [...all].sort((a, b) => b.views - a.views).slice(0, 10),
    bottom: [...all].sort((a, b) => a.views - b.views).slice(0, 10),
  };
}

export async function getAggregateDropoff(): Promise<DropoffPoint[]> {
  const { enrolls, prog, courses } = await loadBase();
  const doneMap = buildDoneMap(prog);
  const maxLessons = Math.max(...courses.map((c) => c.lessons.length));
  const perCourse = courses.map((c) => ({ c, enrolledIds: enrolledIdsFor(c.slug, enrolls) }));
  const out: DropoffPoint[] = [];
  for (let p = 1; p <= maxLessons; p++) {
    let reached = 0;
    let totalEnrolled = 0;
    for (const { c, enrolledIds } of perCourse) {
      if (c.lessons.length < p) continue;
      totalEnrolled += enrolledIds.length;
      // Reached lesson at position p (0-indexed p-1).
      reached += enrolledIds.filter((id) => doneCount(doneMap, id, c.slug) >= p - 1).length;
    }
    out.push({ position: p, learners: reached, pct: totalEnrolled ? (reached / totalEnrolled) * 100 : 0 });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Per-user engagement (Tasks 5–6 of the mock's Lot 3)                         */
/* -------------------------------------------------------------------------- */

type ProgGroup = { courseSlug: string; lessonsDone: number; lessonsTotal: number; lastActivityAt: string };

/** userId -> per-course activity groups. A (userId, courseSlug) pair only
 *  appears here if at least one progress row for it counts as "activity"
 *  (completedAt set OR lastPositionSeconds > 0) — same activity test
 *  real/users.ts's enrichUser uses for `lastActiveAt`. A user with NO entry
 *  here has never been active on any course (mirrors mock's
 *  `lastActiveAt === null`). */
function buildProgressGroups(prog: DbProgress[], courseBySlug: Map<string, Course>): Map<string, ProgGroup[]> {
  const byUserCourse = new Map<string, { done: number; last: string }>();
  for (const p of prog) {
    const isActivity = Boolean(p.completedAt) || p.lastPositionSeconds > 0;
    if (!isActivity) continue;
    const key = `${p.userId} ${p.courseSlug}`;
    const cur = byUserCourse.get(key) ?? { done: 0, last: '' };
    if (p.completedAt) cur.done += 1;
    const t = iso(p.updatedAt)!;
    if (t > cur.last) cur.last = t;
    byUserCourse.set(key, cur);
  }
  const out = new Map<string, ProgGroup[]>();
  for (const [key, v] of byUserCourse) {
    const [userId, slug] = key.split(' ');
    const lessonsTotal = courseBySlug.get(slug)?.lessons.length ?? 0;
    const arr = out.get(userId) ?? [];
    arr.push({ courseSlug: slug, lessonsDone: v.done, lessonsTotal, lastActivityAt: v.last });
    out.set(userId, arr);
  }
  return out;
}

function overallLastActive(groups: ProgGroup[]): string | null {
  return groups.reduce<string | null>((m, g) => (!m || g.lastActivityAt > m ? g.lastActivityAt : m), null);
}

export async function getActiveLearners(query: EngagementQuery): Promise<ActiveLearnerRow[]> {
  const { users, prog, courses } = await loadBase();
  const courseBySlug = new Map(courses.map((c) => [c.slug, c]));
  const now = Date.now();
  const days = query.days ?? 7;
  const groups = buildProgressGroups(prog, courseBySlug);
  const out: ActiveLearnerRow[] = [];

  for (const u of users) {
    const userGroups = groups.get(u.id);
    if (!userGroups || userGroups.length === 0) continue;
    const lastActive = overallLastActive(userGroups);
    if (!lastActive || now - Date.parse(lastActive) > days * DAY) continue;

    let chosen: ProgGroup | undefined;
    if (query.course) {
      chosen = userGroups.find((g) => g.courseSlug === query.course);
      if (!chosen) continue;
    } else {
      // Course in progress: prefer truly-started-but-unfinished, most recent activity.
      const byActivity = (a: ProgGroup, b: ProgGroup) => b.lastActivityAt.localeCompare(a.lastActivityAt);
      chosen =
        [...userGroups].filter((g) => g.lessonsDone > 0 && g.lessonsDone < g.lessonsTotal).sort(byActivity)[0] ??
        [...userGroups].filter((g) => g.lessonsDone > 0).sort(byActivity)[0] ??
        [...userGroups].sort(byActivity)[0];
    }
    if (!chosen) continue;

    const c = courseBySlug.get(chosen.courseSlug);
    out.push({
      userId: u.id,
      userName: u.name ?? u.email,
      userEmail: u.email,
      courseSlug: chosen.courseSlug,
      courseTitle_fr: c?.title_fr ?? chosen.courseSlug,
      courseTitle_ht: c?.title_ht ?? chosen.courseSlug,
      lessonsDone: chosen.lessonsDone,
      lessonsTotal: chosen.lessonsTotal,
      lastActiveAt: lastActive,
    });
  }
  return out.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

export async function getStuckUsers(): Promise<StuckUserRow[]> {
  const { users, payments, subs, enrolls, prog, courses } = await loadBase();
  const courseBySlug = new Map(courses.map((c) => [c.slug, c]));
  const groups = buildProgressGroups(prog, courseBySlug);

  const paidByUser = new Map<string, number>();
  for (const p of payments) {
    if (p.status === 'completed') paidByUser.set(p.userId, (paidByUser.get(p.userId) ?? 0) + p.amountCents);
  }
  const activeSubUsers = new Set(subs.filter((s) => s.status === 'active').map((s) => s.userId));

  const out: StuckUserRow[] = [];
  for (const u of users) {
    if (groups.has(u.id)) continue; // watched something → not stuck
    const hasPaid = (paidByUser.get(u.id) ?? 0) > 0 || activeSubUsers.has(u.id);
    if (!hasPaid) continue;
    const slugs = [
      ...new Set(enrolls.filter((e) => e.userId === u.id && e.status === 'active').map((e) => e.courseSlug)),
    ];
    out.push({
      userId: u.id,
      userName: u.name ?? u.email,
      userEmail: u.email,
      createdAt: iso(u.createdAt)!,
      courses: slugs.map((slug) => {
        const c = courseBySlug.get(slug);
        return { code: c?.code ?? slug, title_fr: c?.title_fr ?? slug, title_ht: c?.title_ht ?? slug };
      }),
      amountPaidCents: paidByUser.get(u.id) ?? 0,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
