'use server';

/**
 * Learner progress server action — Task L1d. Marks a lesson as complete for
 * the signed-in user and, once every lesson of the course is done, auto-
 * issues a certificate (idempotent — a course only ever gets one).
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db, schema } from '@/db';
import { clerkEnabled } from '@/lib/clerk';
import { getCourseBySlug } from '@/lib/courses/source';
import { hasCourseAccess, resolveUserId } from './access';

const T = schema;

// Unambiguous base32 (no 0/O/1/I/L) — 8 chars ⇒ 32^8 ≈ 1.1e12 combinations.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateVerificationCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `PA-${code}`;
}

export type MarkLessonDoneResult =
  | {
      ok: true;
      lessonsDone: number;
      lessonsTotal: number;
      completedLessons: number[];
      certificateIssued: boolean;
      verificationCode: string | null;
    }
  | { ok: false; error: 'unauthorized' | 'no_access' | 'invalid' };

export async function markLessonDoneAction(
  courseSlug: string,
  lessonIndex: number,
): Promise<MarkLessonDoneResult> {
  const { userId: clerkId } = clerkEnabled ? await auth() : { userId: null };
  if (!clerkId) return { ok: false, error: 'unauthorized' };

  const course = await getCourseBySlug(courseSlug);
  if (!course || !Number.isFinite(lessonIndex) || lessonIndex < 1 || lessonIndex > course.lessons.length) {
    return { ok: false, error: 'invalid' };
  }

  const access = await hasCourseAccess(clerkId, courseSlug);
  if (!access) return { ok: false, error: 'no_access' };

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return { ok: false, error: 'no_access' };

    const now = new Date();
    await db
      .insert(T.progress)
      .values({
        userId,
        courseSlug,
        lessonIndex,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [T.progress.userId, T.progress.courseSlug, T.progress.lessonIndex],
        set: { completedAt: now, updatedAt: now },
      });

    const progressRows = await db
      .select({ lessonIndex: T.progress.lessonIndex })
      .from(T.progress)
      .where(
        and(
          eq(T.progress.userId, userId),
          eq(T.progress.courseSlug, courseSlug),
          isNotNull(T.progress.completedAt),
        ),
      );
    const completedLessons = progressRows
      .map((r) => r.lessonIndex)
      .sort((a, b) => a - b);
    const lessonsTotal = course.lessons.length;
    const lessonsDone = completedLessons.length;

    let certificateIssued = false;
    let verificationCode: string | null = null;

    if (lessonsDone >= lessonsTotal) {
      const [existingCert] = await db
        .select({ verificationCode: T.certificates.verificationCode })
        .from(T.certificates)
        .where(and(eq(T.certificates.userId, userId), eq(T.certificates.courseSlug, courseSlug)))
        .limit(1);

      if (existingCert) {
        verificationCode = existingCert.verificationCode;
      } else {
        const [user] = await db
          .select({ certificateName: T.users.certificateName, name: T.users.name })
          .from(T.users)
          .where(eq(T.users.id, userId))
          .limit(1);
        const certificateName = user?.certificateName ?? user?.name ?? '—';

        // Retry a handful of times in the astronomically unlikely event of a
        // verification_code collision (unique constraint on that column).
        for (let attempt = 0; attempt < 5 && !verificationCode; attempt++) {
          const code = generateVerificationCode();
          try {
            await db.insert(T.certificates).values({
              userId,
              courseSlug,
              certificateName,
              verificationCode: code,
            });
            verificationCode = code;
            certificateIssued = true;
          } catch (err) {
            if (attempt === 4) throw err;
          }
        }
      }
    }

    return { ok: true, lessonsDone, lessonsTotal, completedLessons, certificateIssued, verificationCode };
  } catch (err) {
    console.error('[learner/progress-actions] markLessonDoneAction failed:', err);
    return { ok: false, error: 'invalid' };
  }
}
