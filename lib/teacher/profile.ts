/**
 * lib/teacher/profile.ts — the teacher marketplace data-access module
 * (Task C3-T1). Read-only foundation: `teacher_profiles` + `earnings_ledger`
 * + `withdrawal_requests` + the C3 `platform_settings` columns
 * (`commission_pct`/`payout_threshold_cents`).
 *
 * GATED + NEVER-THROW, mirroring lib/courses/source.ts's pattern exactly:
 * no DATABASE_URL, OR the query fails, OR the row/rows don't exist
 *   ⇒ fall back to a safe empty value (`null`/`false`/`0`/`[]`/a sane
 *     default) — never throws. This is what keeps dev/build/mock working
 *     before the C3 migration is pushed live (db:push is owner-manual/
 *     sandbox-blocked — see the migration in db/migrations/0007_*.sql).
 *
 * Nothing in this module is consumed by any UI/action yet — later C3 tasks
 * (onboarding, studio, ledger writes, payouts) build on top of these reads.
 * No money-path change: this task only ADDS schema + read helpers.
 *
 * `getTeacherBalanceCents`/`getTeacherLedger` deliberately re-derive the
 * balance from the ledger rows every call (`SUM(net_cents)`) instead of
 * trusting any cached/denormalised number — per the spec's "Solde =
 * SUM(net_cents) — jamais dénormalisé."
 */
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { clerkEnabled } from '@/lib/clerk';
import { resolveUserId } from '@/lib/learner/access';

const T = schema;

export type TeacherProfile = {
  id: string;
  userId: string;
  /** Public /prof/[slug] URL segment — null until approval generates one (see lib/teacher/admin.ts). */
  slug: string | null;
  displayName: string | null;
  bioHt: string | null;
  bioFr: string | null;
  photoUrl: string | null;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  payoutMethod: 'moncash' | 'natcash' | 'paypal' | 'bank' | null;
  payoutDestination: string | null;
  videoQuotaMinutes: number | null;
  termsAcceptedAt: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LedgerRow = {
  id: string;
  teacherUserId: string;
  paymentId: string | null;
  kind: 'sale' | 'refund' | 'withdrawal' | 'adjustment';
  grossCents: number;
  commissionPctApplied: number;
  commissionCents: number;
  netCents: number;
  currency: string;
  note: string | null;
  createdAt: string;
};

export type WithdrawalRow = {
  id: string;
  teacherUserId: string;
  amountCents: number;
  method: string | null;
  destinationSnapshot: string | null;
  status: 'pending' | 'paid' | 'rejected';
  processedBy: string | null;
  processedAt: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_COMMISSION_PCT = 30;
const DEFAULT_PAYOUT_THRESHOLD_CENTS = 2500;
const DEFAULT_VIDEO_QUOTA_MINUTES = 600;

type DbTeacherProfileRow = typeof T.teacherProfiles.$inferSelect;
type DbLedgerRow = typeof T.earningsLedger.$inferSelect;
type DbWithdrawalRow = typeof T.withdrawalRequests.$inferSelect;

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

/** Pure DB-row → TeacherProfile mapper (exported for unit testing without a real DB). */
export function mapDbTeacherProfile(row: DbTeacherProfileRow): TeacherProfile {
  return {
    id: row.id,
    userId: row.userId,
    slug: row.slug ?? null,
    displayName: row.displayName ?? null,
    bioHt: row.bioHt ?? null,
    bioFr: row.bioFr ?? null,
    photoUrl: row.photoUrl ?? null,
    status: row.status,
    payoutMethod: row.payoutMethod ?? null,
    payoutDestination: row.payoutDestination ?? null,
    videoQuotaMinutes: row.videoQuotaMinutes ?? null,
    termsAcceptedAt: iso(row.termsAcceptedAt),
    reviewNote: row.reviewNote ?? null,
    reviewedBy: row.reviewedBy ?? null,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  };
}

/** Pure DB-row → LedgerRow mapper (exported for unit testing without a real DB). */
export function mapDbLedgerRow(row: DbLedgerRow): LedgerRow {
  return {
    id: row.id,
    teacherUserId: row.teacherUserId,
    paymentId: row.paymentId ?? null,
    kind: row.kind,
    grossCents: row.grossCents,
    commissionPctApplied: row.commissionPctApplied,
    commissionCents: row.commissionCents,
    netCents: row.netCents,
    currency: row.currency,
    note: row.note ?? null,
    createdAt: iso(row.createdAt)!,
  };
}

/** Pure DB-row → WithdrawalRow mapper (exported for unit testing without a real DB). */
export function mapDbWithdrawalRow(row: DbWithdrawalRow): WithdrawalRow {
  return {
    id: row.id,
    teacherUserId: row.teacherUserId,
    amountCents: row.amountCents,
    method: row.method ?? null,
    destinationSnapshot: row.destinationSnapshot ?? null,
    status: row.status,
    processedBy: row.processedBy ?? null,
    processedAt: iso(row.processedAt),
    reference: row.reference ?? null,
    note: row.note ?? null,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  };
}

/**
 * Pure sum over ledger rows' `net_cents` (exported for unit testing) — the
 * ONE place a teacher's balance is computed. Negative rows (refund/
 * withdrawal) subtract naturally; nothing here is denormalised anywhere.
 */
export function sumNetCents(rows: Pick<LedgerRow, 'netCents'>[]): number {
  return rows.reduce((acc, r) => acc + r.netCents, 0);
}

/**
 * Reads a single `teacher_profiles` row by `userId`. GATED + FALLBACK: no
 * DATABASE_URL, a failed query, or no matching row ⇒ `null`, never throws.
 */
export async function getTeacherProfile(userId: string): Promise<TeacherProfile | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .select()
      .from(T.teacherProfiles)
      .where(eq(T.teacherProfiles.userId, userId))
      .limit(1);
    return row ? mapDbTeacherProfile(row) : null;
  } catch (err) {
    console.error('[teacher/profile] getTeacherProfile DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * True only when the user has an APPROVED teacher profile. GATED + FALLBACK:
 * no DB / no profile / query failure ⇒ `false`, never throws.
 */
export async function isApprovedTeacher(userId: string): Promise<boolean> {
  const profile = await getTeacherProfile(userId);
  return profile?.status === 'approved';
}

/**
 * Resolves the CURRENTLY SIGNED-IN Clerk session (if any) to whether that
 * user has an APPROVED `teacher_profiles` row — the single check both the
 * public nav (components/layout/Nav.tsx's `StudioLink`) and the /kont
 * account page need to decide whether to surface a "studio" entry point
 * (Task: studio access everywhere — before this, the studio had no link
 * anywhere outside /enseigner and /admin/cours). Centralised here so the two
 * call sites can't drift on the gating logic.
 *
 * GATED + NEVER-THROW: Clerk disabled, no DATABASE_URL, signed out, no
 * matching `users` row, or a failed query ⇒ `false`, never throws — callers
 * are server components rendered on every request, so this must never crash
 * the page around it.
 */
export async function currentUserIsApprovedTeacher(): Promise<boolean> {
  if (!clerkEnabled || !dbConfigured()) return false;
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return false;
    const userId = await resolveUserId(clerkId);
    if (!userId) return false;
    return await isApprovedTeacher(userId);
  } catch (err) {
    console.error('[teacher/profile] currentUserIsApprovedTeacher failed, falling back to false:', err);
    return false;
  }
}

/**
 * Every `earnings_ledger` row for a teacher, newest first. GATED + FALLBACK:
 * no DATABASE_URL or a failed query ⇒ `[]`, never throws.
 */
export async function getTeacherLedger(userId: string): Promise<LedgerRow[]> {
  if (!dbConfigured()) return [];
  try {
    const rows = await db
      .select()
      .from(T.earningsLedger)
      .where(eq(T.earningsLedger.teacherUserId, userId));
    return rows.map(mapDbLedgerRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.error('[teacher/profile] getTeacherLedger DB read failed, falling back to []:', err);
    return [];
  }
}

/**
 * A teacher's balance in cents — `SUM(net_cents)` over their ledger rows.
 * GATED + FALLBACK: no DB / no rows / query failure ⇒ `0`, never throws.
 * Never denormalised — always re-derived from `getTeacherLedger`.
 */
export async function getTeacherBalanceCents(userId: string): Promise<number> {
  const ledger = await getTeacherLedger(userId);
  return sumNetCents(ledger);
}

/**
 * Every `withdrawal_requests` row for a teacher, newest first. GATED +
 * FALLBACK: no DATABASE_URL or a failed query ⇒ `[]`, never throws.
 */
export async function getWithdrawals(userId: string): Promise<WithdrawalRow[]> {
  if (!dbConfigured()) return [];
  try {
    const rows = await db
      .select()
      .from(T.withdrawalRequests)
      .where(eq(T.withdrawalRequests.teacherUserId, userId));
    return rows.map(mapDbWithdrawalRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.error('[teacher/profile] getWithdrawals DB read failed, falling back to []:', err);
    return [];
  }
}

/**
 * The platform commission percentage (`platform_settings.commission_pct`).
 * GATED + FALLBACK: no DATABASE_URL, no settings row, or a failed query ⇒
 * the spec default (30), never throws.
 */
export async function getCommissionPct(): Promise<number> {
  if (!dbConfigured()) return DEFAULT_COMMISSION_PCT;
  try {
    const [row] = await db
      .select()
      .from(T.platformSettings)
      .where(eq(T.platformSettings.id, 'singleton'))
      .limit(1);
    return row?.commissionPct ?? DEFAULT_COMMISSION_PCT;
  } catch (err) {
    console.error('[teacher/profile] getCommissionPct DB read failed, falling back to default:', err);
    return DEFAULT_COMMISSION_PCT;
  }
}

/**
 * The payout request threshold in cents (`platform_settings.payout_threshold_cents`).
 * GATED + FALLBACK: no DATABASE_URL, no settings row, or a failed query ⇒
 * the spec default ($25 = 2500 cents), never throws.
 */
export async function getPayoutThresholdCents(): Promise<number> {
  if (!dbConfigured()) return DEFAULT_PAYOUT_THRESHOLD_CENTS;
  try {
    const [row] = await db
      .select()
      .from(T.platformSettings)
      .where(eq(T.platformSettings.id, 'singleton'))
      .limit(1);
    return row?.payoutThresholdCents ?? DEFAULT_PAYOUT_THRESHOLD_CENTS;
  } catch (err) {
    console.error('[teacher/profile] getPayoutThresholdCents DB read failed, falling back to default:', err);
    return DEFAULT_PAYOUT_THRESHOLD_CENTS;
  }
}

/**
 * The default video-storage quota (minutes) granted to a NEWLY approved
 * teacher (`platform_settings.default_video_quota_minutes`), copied onto
 * `teacher_profiles.video_quota_minutes` at approval time (Task C3-T3 —
 * see lib/teacher/admin.ts's `approveTeacherProfile`). GATED + FALLBACK: no
 * DATABASE_URL, no settings row, or a failed query ⇒ the spec default
 * (600 min = 10h), never throws.
 */
export async function getDefaultVideoQuotaMinutes(): Promise<number> {
  if (!dbConfigured()) return DEFAULT_VIDEO_QUOTA_MINUTES;
  try {
    const [row] = await db
      .select()
      .from(T.platformSettings)
      .where(eq(T.platformSettings.id, 'singleton'))
      .limit(1);
    return row?.defaultVideoQuotaMinutes ?? DEFAULT_VIDEO_QUOTA_MINUTES;
  } catch (err) {
    console.error('[teacher/profile] getDefaultVideoQuotaMinutes DB read failed, falling back to default:', err);
    return DEFAULT_VIDEO_QUOTA_MINUTES;
  }
}
