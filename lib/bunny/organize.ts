/**
 * lib/bunny/organize.ts — the single place that turns "a teacher picked a
 * file for lesson X" into a fully-organized Bunny upload: the AUTHORITATIVE
 * structured video title (lib/bunny/naming.ts) plus the course's Bunny
 * Collection id (lib/bunny/collections.ts), resolved server-side so neither
 * studio nor admin upload actions duplicate this logic (see
 * lib/teacher/studio-actions.ts's `createMyVideoUploadAction` / lib/admin/
 * content-actions.ts's `createVideoUploadAction`, both of which call
 * `planOrganizedUpload` AFTER their own ownership/capability gate).
 *
 * BEST-EFFORT, end to end: this function NEVER throws. Any failure —
 * course/lesson not found, DB read error, Bunny collection create/verify
 * failure — degrades to `{ title: fallbackTitle, collectionId: null }` so
 * the caller's `createBunnyVideo` call still proceeds with a plain,
 * uncollected video under the CLIENT's original title rather than failing
 * the upload. Organization is a nice-to-have layered on top of an upload
 * path that must keep working with zero DB/Bunny configuration.
 */
import { getAdminCourse, setCourseBunnyCollectionId } from '@/lib/courses/write';
import { getTeacherProfile } from '@/lib/teacher/profile';
import { getCourseTeacher } from '@/data/teachers';
import { ensureCourseCollection } from './collections';
import { buildBunnyVideoTitle } from './naming';

export type OrganizedUploadPlan = {
  /** The server-computed, structured title — overrides whatever the client sent. */
  title: string;
  /** The course's Bunny Collection guid, or `null` if organization couldn't
   *  complete (not configured, create/verify failed, course/lesson unresolved). */
  collectionId: string | null;
};

/**
 * Resolves the teacher display name for collection naming: the course
 * owner's `teacher_profiles.display_name` first (real marketplace teachers),
 * else the static `data/teachers.ts` registry entry for this course slug
 * (the founder's own launch catalog, which predates `teacher_profiles`
 * rows), else the platform's own name. Never throws.
 */
async function resolveTeacherName(slug: string, ownerUserId: string | null): Promise<string> {
  if (ownerUserId) {
    try {
      const profile = await getTeacherProfile(ownerUserId);
      if (profile?.displayName?.trim()) return profile.displayName.trim();
    } catch {
      // fall through to the static registry
    }
  }
  const staticTeacher = getCourseTeacher(slug);
  if (staticTeacher?.displayName?.trim()) return staticTeacher.displayName.trim();
  return 'PNICE Academy';
}

export async function planOrganizedUpload(params: {
  slug: string;
  lessonId: string;
  /** The client-supplied title — used ONLY as a fallback when the course/
   *  lesson can't be resolved (deleted mid-upload, stale id, DB hiccup). */
  fallbackTitle: string;
}): Promise<OrganizedUploadPlan> {
  try {
    const course = await getAdminCourse(params.slug);
    if (!course) return { title: params.fallbackTitle, collectionId: null };

    const lesson = course.lessons.find((l) => l.id === params.lessonId);
    if (!lesson) return { title: params.fallbackTitle, collectionId: null };

    const chapter = lesson.chapterId ? (course.chapters.find((c) => c.id === lesson.chapterId) ?? null) : null;

    const title = buildBunnyVideoTitle({
      courseCode: course.code || null,
      chapterIndex: chapter ? chapter.sortOrder : null,
      chapterTitle: chapter ? { ht: chapter.title_ht, fr: chapter.title_fr } : null,
      lessonIndex: lesson.sortOrder,
      lessonTitle: { ht: lesson.title_ht, fr: lesson.title_fr },
    });

    const teacherName = await resolveTeacherName(params.slug, course.ownerUserId);
    const result = await ensureCourseCollection({
      slug: params.slug,
      courseCode: course.code || null,
      courseTitle: course.title_ht || course.title_fr,
      teacherName,
      existingCollectionId: course.bunnyCollectionId,
    });

    if (!result.ok) {
      console.error(
        `[bunny/organize] ensureCourseCollection failed for course "${params.slug}" (best-effort, upload proceeds without a collection): ${result.message}`,
      );
      return { title, collectionId: null };
    }

    // Persist a NEWLY-created collection id (only when the course didn't
    // already have one) so every later upload for this course reuses it —
    // best-effort, wrapped separately: a failure to SAVE the id must not
    // undo an otherwise-successful collection creation or fail this upload.
    if (!course.bunnyCollectionId) {
      try {
        await setCourseBunnyCollectionId(params.slug, result.collectionId);
      } catch (e) {
        console.error(`[bunny/organize] failed to persist bunny_collection_id for "${params.slug}" (non-fatal):`, e);
      }
    }

    return { title, collectionId: result.collectionId };
  } catch (e) {
    console.error('[bunny/organize] planOrganizedUpload failed, falling back to the client-supplied title:', e);
    return { title: params.fallbackTitle, collectionId: null };
  }
}
