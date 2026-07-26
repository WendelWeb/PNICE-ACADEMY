/**
 * lib/teacher/studio.ts — gated READS for the teacher studio (Task C3-T4),
 * the read-side companion to lib/teacher/studio-actions.ts's mutations.
 *
 * GATED + NEVER-THROW, mirroring lib/teacher/profile.ts / lib/courses/
 * write.ts exactly: no DATABASE_URL, a failed query, or no matching row ⇒ a
 * safe empty value (`[]`/`null`/a zeroed summary) — never throws, so the
 * studio pages render an empty state instead of crashing pre-migration.
 *
 * `getMyCourse` is the READ-SIDE half of the ownership check (`null` for a
 * slug that doesn't exist OR isn't owned by `userId`) — the studio EDIT
 * PAGE uses this to 404/redirect before ever rendering the CMS editor
 * components; `lib/teacher/studio-actions.ts`'s `requireOwnedCourse` is the
 * independent WRITE-SIDE half every mutation re-checks. Defense in depth:
 * a page that somehow rendered the wrong course could still never save it.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { getAdminCourse, type AdminCourse, type DbCourseStatus } from '@/lib/courses/write';
import {
  getTeacherLedger,
  getWithdrawals,
  getPayoutThresholdCents,
  getTeacherProfile,
  sumNetCents,
  type LedgerRow,
} from './profile';

const T = schema;

export type MyCourseRow = {
  slug: string;
  code: string;
  title_ht: string;
  title_fr: string;
  priceCents: number;
  status: DbCourseStatus;
  hasUnpublishedChanges: boolean;
  lessonsCount: number;
  reviewNote: string | null;
  submittedAt: string | null;
  /** Completed payments for this course (gross, before the platform's cut). */
  salesCount: number;
  revenueCents: number;
};

/**
 * Every course owned by `userId`, ANY status, with per-course sales count +
 * gross revenue (completed `payments` rows matched by `course_slug`).
 * GATED + FALLBACK: no DATABASE_URL or a failed query ⇒ `[]`, never throws.
 */
export async function getMyCourses(userId: string): Promise<MyCourseRow[]> {
  if (!dbConfigured()) return [];
  try {
    const [courseRows, lessonRows, paymentRows] = await Promise.all([
      db.select().from(T.courses).where(eq(T.courses.ownerUserId, userId)),
      db.select({ courseSlug: T.lessons.courseSlug }).from(T.lessons),
      db
        .select({ courseSlug: T.payments.courseSlug, amountCents: T.payments.amountCents, status: T.payments.status })
        .from(T.payments),
    ]);

    const lessonCounts = new Map<string, number>();
    for (const l of lessonRows) lessonCounts.set(l.courseSlug, (lessonCounts.get(l.courseSlug) ?? 0) + 1);

    // Most recently updated first — the teacher's just-edited/just-created
    // course should surface at the top of their studio dashboard.
    const sortedRows = [...courseRows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return sortedRows.map((r): MyCourseRow => {
      const sales = paymentRows.filter((p) => p.courseSlug === r.slug && p.status === 'completed');
      return {
        slug: r.slug,
        code: r.code ?? r.slug,
        title_ht: r.titleHt ?? '',
        title_fr: r.titleFr ?? '',
        priceCents: r.priceCents ?? 0,
        status: r.status,
        hasUnpublishedChanges: r.hasUnpublishedChanges,
        lessonsCount: lessonCounts.get(r.slug) ?? 0,
        reviewNote: r.reviewNote ?? null,
        submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
        salesCount: sales.length,
        revenueCents: sales.reduce((s, p) => s + p.amountCents, 0),
      };
    });
  } catch (err) {
    console.error('[teacher/studio] getMyCourses DB read failed, falling back to []:', err);
    return [];
  }
}

/**
 * One of MY courses (any status), full editable shape — `null` if it
 * doesn't exist OR isn't owned by `userId` (see file header). GATED +
 * FALLBACK: no DATABASE_URL or a failed query ⇒ `null`, never throws.
 */
export async function getMyCourse(userId: string, slug: string): Promise<AdminCourse | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .select({ ownerUserId: T.courses.ownerUserId })
      .from(T.courses)
      .where(eq(T.courses.slug, slug))
      .limit(1);
    if (!row || row.ownerUserId !== userId) return null;
    return await getAdminCourse(slug);
  } catch (err) {
    console.error('[teacher/studio] getMyCourse DB read failed, falling back to null:', err);
    return null;
  }
}

export type StudioSummary = {
  balanceCents: number;
  /** Amount of the currently pending withdrawal request, if any. */
  pendingWithdrawalCents: number | null;
  thresholdCents: number;
  /** Most recent ledger rows (newest first), capped for the dashboard panel. */
  ledger: LedgerRow[];
  videoQuotaMinutes: number | null;
};

/**
 * Everything the studio dashboard's money panel needs, in one gated call:
 * balance (re-derived from the ledger, never denormalised — see
 * lib/teacher/profile.ts's `getTeacherBalanceCents`), pending-withdrawal
 * state, the payout threshold, recent ledger rows, and the video quota.
 * GATED + FALLBACK: no DATABASE_URL or a failed read ⇒ a safe zeroed
 * summary, never throws.
 */
export async function getMyStudioSummary(userId: string): Promise<StudioSummary> {
  const empty: StudioSummary = {
    balanceCents: 0,
    pendingWithdrawalCents: null,
    thresholdCents: 2500,
    ledger: [],
    videoQuotaMinutes: null,
  };
  if (!dbConfigured()) return empty;
  try {
    const [ledger, withdrawals, thresholdCents, profile] = await Promise.all([
      getTeacherLedger(userId),
      getWithdrawals(userId),
      getPayoutThresholdCents(),
      getTeacherProfile(userId),
    ]);
    const pending = withdrawals.find((w) => w.status === 'pending') ?? null;
    return {
      balanceCents: sumNetCents(ledger),
      pendingWithdrawalCents: pending?.amountCents ?? null,
      thresholdCents,
      ledger: ledger.slice(0, 10),
      videoQuotaMinutes: profile?.videoQuotaMinutes ?? null,
    };
  } catch (err) {
    console.error('[teacher/studio] getMyStudioSummary DB read failed, falling back to empty:', err);
    return empty;
  }
}
