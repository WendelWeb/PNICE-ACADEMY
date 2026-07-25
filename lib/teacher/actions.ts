'use server';

/**
 * lib/teacher/actions.ts — teacher onboarding WRITE path (Task C3-T2), the
 * mutation companion to lib/teacher/profile.ts's read helpers. One export:
 * `applyAsTeacherAction`, called by the client wizard
 * (components/teacher/ApplyWizard.tsx) from the /enseigner page.
 *
 * Field validation lives in lib/teacher/apply-validation.ts, NOT here — see
 * that file's header: Next.js requires every top-level export of a
 * 'use server' module to be an async function, so the pure validator/consts
 * had to move out (this also lets the client wizard import the exact same
 * validator for real-time feedback).
 *
 * ENV-GATED exactly like lib/courses/write.ts: `dbConfigured()` is checked
 * FIRST, before `auth()` or any `db` touch — no DATABASE_URL ⇒
 * `{ ok: false, message: 'db_required' }`, never throws, and (importantly)
 * never calls Clerk either, so this path is unit-testable with no live
 * Clerk/DB (see lib/site-actions-public.ts's `captureUtmAction`, the same
 * pattern, and its test).
 *
 * UPSERT SHAPE (one `teacher_profiles` row per user, `user_id` UNIQUE):
 *   - no existing row               → INSERT status='pending'.
 *   - existing row, status 'rejected' or 'pending' → UPDATE back to
 *     'pending' (a rejected applicant re-applying, or a pending applicant
 *     amending their submission before review — both idempotent: calling
 *     this twice in a row just re-saves the same fields, no duplicate row
 *     is ever created because of the unique(user_id) constraint).
 *   - existing row, status 'approved' or 'suspended' → BLOCKED, returns a
 *     clear `{ ok: false, status, message: 'already_active' }` — the spec's
 *     "an already-approved/suspended user can't re-apply".
 * Check-then-write (no transaction on the neon-http driver — see
 * lib/courses/write.ts's `createCourse` doc for the same reasoning): fine
 * here too, a single learner applying is not a concurrent-write hazard, and
 * `teacher_profiles.user_id` stays UNIQUE at the DB level as a backstop.
 *
 * The Clerk id → internal `users.id` resolution self-heals exactly like
 * `resolveOrCreateUserId` in lib/admin/data/real/support.ts: a signed-in
 * user applying to teach might not have a `users` row yet if the Clerk
 * webhook hasn't synced them (rare, but possible) — insert one from their
 * Clerk identity rather than fail the application.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { getTeacherProfile } from './profile';
import { validateApplyInput, type ApplyAsTeacherInput } from './apply-validation';

const T = schema;

export type ApplyAsTeacherResult = {
  ok: boolean;
  status?: 'pending' | 'approved' | 'suspended' | 'rejected';
  message?: string;
};

/** clerkId → users.id, self-healing (insert-from-Clerk if no row exists yet).
 *  Mirrors `resolveOrCreateUserId` in lib/admin/data/real/support.ts — kept
 *  as a private duplicate rather than a shared export because that module
 *  is the admin data layer's internal helper, not a public cross-domain API. */
async function resolveOrCreateUserId(clerkId: string): Promise<string> {
  const existing = await resolveUserId(clerkId);
  if (existing) return existing;

  const client = await clerkClient();
  const user = await client.users.getUser(clerkId);
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Utilisateur';
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    '';

  const [inserted] = await db
    .insert(T.users)
    .values({ clerkId, email, name, certificateName: name })
    .onConflictDoUpdate({ target: T.users.clerkId, set: { email, name } })
    .returning({ id: T.users.id });
  return inserted.id;
}

/**
 * A signed-in user applies (or re-applies) to become a teacher. See the
 * file header for the full upsert/gating contract.
 */
export async function applyAsTeacherAction(
  input: ApplyAsTeacherInput,
): Promise<ApplyAsTeacherResult> {
  if (!dbConfigured()) return { ok: false, message: 'db_required' };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return { ok: false, message: 'unauthorized' };

    const invalid = validateApplyInput(input);
    if (invalid) return { ok: false, message: invalid };

    const userId = await resolveOrCreateUserId(clerkId);
    const existing = await getTeacherProfile(userId);

    if (existing && (existing.status === 'approved' || existing.status === 'suspended')) {
      return { ok: false, status: existing.status, message: 'already_active' };
    }

    const now = new Date();
    const fields = {
      displayName: input.displayName.trim(),
      bioHt: input.bioHt.trim(),
      bioFr: input.bioFr.trim(),
      photoUrl: input.photoUrl?.trim() || null,
      payoutMethod: input.payoutMethod,
      payoutDestination: input.payoutDestination.trim(),
      status: 'pending' as const,
      termsAcceptedAt: now,
      updatedAt: now,
    };

    if (existing) {
      // Re-applying (rejected) or amending (still pending): reset the review
      // trail so a stale rejection note never lingers on a fresh submission.
      await db
        .update(T.teacherProfiles)
        .set({ ...fields, reviewNote: null, reviewedBy: null })
        .where(eq(T.teacherProfiles.userId, userId));
    } else {
      await db.insert(T.teacherProfiles).values({ userId, ...fields });
    }

    return { ok: true, status: 'pending' };
  } catch (e) {
    console.error('[teacher/actions] applyAsTeacherAction failed:', e);
    return { ok: false, message: 'error' };
  }
}
