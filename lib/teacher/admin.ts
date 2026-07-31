/**
 * lib/teacher/admin.ts — admin-facing teacher-profile data access (Task
 * C3-T3, `/admin/enseignants`). Mirrors `lib/admin/data/real/users.ts`'s
 * division of labour: reads AND the mutation/`recordAudit` pattern live
 * together here; the 'use server' auth wrapper (lib/teacher/admin-actions.ts)
 * only adds the `requireAdmin('teachers.review')` check + try/catch, same as
 * `lib/admin/actions.ts` does over `real/users.ts`.
 *
 * GATED + NEVER-THROW reads (mirrors lib/teacher/profile.ts exactly): no
 * DATABASE_URL or a failed query ⇒ a safe empty value, never throws — so
 * `/admin/enseignants` renders an empty queue instead of crashing before
 * `db:push` runs. Mutations are ALSO gated (mirrors lib/courses/write.ts's
 * `dbConfigured()` + `{ ok: false, message: 'db_required' }` contract,
 * rather than `real/users.ts`'s assume-DB-is-live shape) because these run
 * from a brand-new admin page that must degrade gracefully pre-migration.
 */
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { recordAudit } from '@/lib/admin/data/real/users';
import { getDefaultVideoQuotaMinutes, mapDbTeacherProfile, type TeacherProfile } from './profile';
import type { AdminActor } from '@/lib/admin/data/types';

const T = schema;

export type TeacherAdminRow = TeacherProfile & {
  /** Alias of `createdAt` — when the applicant submitted the profile. */
  appliedAt: string;
  email: string;
  name: string | null;
};

export type TeacherAdminResult = { ok: boolean; message?: string };

function dbRequired(): TeacherAdminResult {
  return { ok: false, message: 'db_required' };
}

function toAdminRow(profile: typeof T.teacherProfiles.$inferSelect, user: { email: string; name: string | null }): TeacherAdminRow {
  const p = mapDbTeacherProfile(profile);
  return { ...p, appliedAt: p.createdAt, email: user.email, name: user.name ?? null };
}

/**
 * Every `teacher_profiles` row joined with its `users` row (email, name),
 * newest application first — optionally narrowed to one status (the
 * `/admin/enseignants` tab filter). GATED + FALLBACK: no DATABASE_URL or a
 * failed query ⇒ `[]`, never throws.
 */
export async function listTeacherProfiles(status?: TeacherProfile['status']): Promise<TeacherAdminRow[]> {
  if (!dbConfigured()) return [];
  try {
    const rows = await db
      .select({ profile: T.teacherProfiles, user: T.users })
      .from(T.teacherProfiles)
      .innerJoin(T.users, eq(T.teacherProfiles.userId, T.users.id));
    const mapped = rows.map(({ profile, user }) => toAdminRow(profile, { email: user.email, name: user.name }));
    const filtered = status ? mapped.filter((r) => r.status === status) : mapped;
    return filtered.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  } catch (err) {
    console.error('[teacher/admin] listTeacherProfiles DB read failed, falling back to []:', err);
    return [];
  }
}

/**
 * One teacher's profile + user info, by `users.id`. GATED + FALLBACK: no
 * DATABASE_URL, no matching row, or a failed query ⇒ `null`, never throws.
 */
export async function getTeacherProfileForAdmin(userId: string): Promise<TeacherAdminRow | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .select({ profile: T.teacherProfiles, user: T.users })
      .from(T.teacherProfiles)
      .innerJoin(T.users, eq(T.teacherProfiles.userId, T.users.id))
      .where(eq(T.teacherProfiles.userId, userId))
      .limit(1);
    return row ? toAdminRow(row.profile, { email: row.user.email, name: row.user.name }) : null;
  } catch (err) {
    console.error('[teacher/admin] getTeacherProfileForAdmin DB read failed, falling back to null:', err);
    return null;
  }
}

/**
 * Count of `teacher_profiles` rows per status, for the queue's tab badges.
 * GATED + FALLBACK: no DATABASE_URL or a failed query ⇒ all-zero, never
 * throws.
 */
export async function countTeacherProfilesByStatus(): Promise<Record<TeacherProfile['status'], number>> {
  const zero: Record<TeacherProfile['status'], number> = { pending: 0, approved: 0, suspended: 0, rejected: 0 };
  if (!dbConfigured()) return zero;
  try {
    const rows = await db.select({ status: T.teacherProfiles.status }).from(T.teacherProfiles);
    const counts = { ...zero };
    for (const r of rows) counts[r.status]++;
    return counts;
  } catch (err) {
    console.error('[teacher/admin] countTeacherProfilesByStatus DB read failed, falling back to zero:', err);
    return zero;
  }
}

/**
 * Batch-resolves a set of courses' `owner_user_id`s → a display label for
 * the `/admin/cours` oversight list (feat/separate-authoring — that page no
 * longer authors courses, so it needs to make plain WHOSE course each row
 * is). Prefers `teacher_profiles.display_name`, falls back to `users.name`,
 * then `users.email` — an id with none of those (or `null`/unmatched) is
 * simply absent from the returned map; the caller renders "—" itself.
 * GATED + FALLBACK: no DATABASE_URL, an empty input, or a failed query ⇒ an
 * empty map, never throws.
 */
export async function getOwnerDisplayNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!dbConfigured() || ids.length === 0) return new Map();
  try {
    const [profiles, users] = await Promise.all([
      db
        .select({ userId: T.teacherProfiles.userId, displayName: T.teacherProfiles.displayName })
        .from(T.teacherProfiles)
        .where(inArray(T.teacherProfiles.userId, ids)),
      db.select({ id: T.users.id, name: T.users.name, email: T.users.email }).from(T.users).where(inArray(T.users.id, ids)),
    ]);
    const displayNameByUser = new Map(
      profiles.filter((p) => p.displayName).map((p) => [p.userId, p.displayName as string]),
    );
    const userById = new Map(users.map((u) => [u.id, u]));

    const result = new Map<string, string>();
    for (const id of ids) {
      const displayName = displayNameByUser.get(id);
      if (displayName) {
        result.set(id, displayName);
        continue;
      }
      const user = userById.get(id);
      if (user?.name) {
        result.set(id, user.name);
      } else if (user?.email) {
        result.set(id, user.email);
      }
    }
    return result;
  } catch (err) {
    console.error('[teacher/admin] getOwnerDisplayNames DB read failed, falling back to {}:', err);
    return new Map();
  }
}

/* ------------------------------- mutations -------------------------------- */

/**
 * Approve a pending teacher profile: status → 'approved', records the
 * reviewing admin, and grants the platform's default video quota (Task
 * C3-T3 — `platform_settings.default_video_quota_minutes`, frozen onto the
 * profile the same way a course's commission is frozen at sale time, so a
 * later platform-default change doesn't retroactively shrink/grow an
 * already-approved teacher's quota). Requires `current.status === 'pending' || 'rejected'`.
 */
export async function approveTeacherProfile(p: { userId: string; admin: AdminActor }): Promise<TeacherAdminResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.teacherProfiles.status }).from(T.teacherProfiles).where(eq(T.teacherProfiles.userId, p.userId)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending' && current.status !== 'rejected') return { ok: false, message: 'invalid_status' };
  const quota = await getDefaultVideoQuotaMinutes();
  await db
    .update(T.teacherProfiles)
    .set({ status: 'approved', reviewedBy: p.admin.id, videoQuotaMinutes: quota, updatedAt: new Date() })
    .where(eq(T.teacherProfiles.userId, p.userId));
  await recordAudit({ action: 'approve_teacher', userId: p.userId, admin: p.admin });
  return { ok: true };
}

/** Reject a pending teacher profile with a required note. Requires `current.status === 'pending'`. */
export async function rejectTeacherProfile(p: { userId: string; note: string; admin: AdminActor }): Promise<TeacherAdminResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.teacherProfiles.status }).from(T.teacherProfiles).where(eq(T.teacherProfiles.userId, p.userId)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending') return { ok: false, message: 'invalid_status' };
  await db
    .update(T.teacherProfiles)
    .set({ status: 'rejected', reviewNote: p.note, reviewedBy: p.admin.id, updatedAt: new Date() })
    .where(eq(T.teacherProfiles.userId, p.userId));
  await recordAudit({ action: 'reject_teacher', userId: p.userId, admin: p.admin, reason: p.note });
  return { ok: true };
}

/** Suspend an approved teacher (blocks new publishing — enforced by later C3 tasks) with a required reason. Requires `current.status === 'approved'`. */
export async function suspendTeacherProfile(p: { userId: string; reason: string; admin: AdminActor }): Promise<TeacherAdminResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.teacherProfiles.status }).from(T.teacherProfiles).where(eq(T.teacherProfiles.userId, p.userId)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'approved') return { ok: false, message: 'invalid_status' };
  await db
    .update(T.teacherProfiles)
    .set({ status: 'suspended', reviewNote: p.reason, reviewedBy: p.admin.id, updatedAt: new Date() })
    .where(eq(T.teacherProfiles.userId, p.userId));
  await recordAudit({ action: 'suspend_teacher', userId: p.userId, admin: p.admin, reason: p.reason });
  return { ok: true };
}

/** Reactivate a suspended teacher back to 'approved'. Requires `current.status === 'suspended'` and sets reviewedBy to the acting admin. */
export async function reactivateTeacherProfile(p: { userId: string; admin: AdminActor }): Promise<TeacherAdminResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select({ status: T.teacherProfiles.status }).from(T.teacherProfiles).where(eq(T.teacherProfiles.userId, p.userId)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'suspended') return { ok: false, message: 'invalid_status' };
  await db
    .update(T.teacherProfiles)
    .set({ status: 'approved', reviewedBy: p.admin.id, updatedAt: new Date() })
    .where(eq(T.teacherProfiles.userId, p.userId));
  await recordAudit({ action: 'reactivate_teacher', userId: p.userId, admin: p.admin });
  return { ok: true };
}
