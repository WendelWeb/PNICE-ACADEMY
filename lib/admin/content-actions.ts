'use server';

/**
 * CMS content server actions (Task C2-T4). Content edits (create/update
 * course, lessons, images) are gated on `courses.edit`; publish/unpublish/
 * delete are gated on `teachers.review` (Task C3 fix — see `requireModerator`
 * below: those are moderation acts, not content edits, and must go through
 * the same capability as the review queue). A thin auth+wiring layer over
 * `lib/courses/write.ts` — the real DB write ops — mirroring the established
 * `lib/admin/*-actions.ts` → `lib/admin/data/real/*.ts` division of labour
 * (auth here, logic + audit there). Retires the in-memory content store
 * (lib/admin/content/{store, ops}.ts): a save/publish/lesson/image edit here
 * now writes a REAL `courses`/`lessons` row, so it reflects on the public
 * site (via lib/courses/source.ts) as soon as the ISR path is revalidated.
 *
 * Without a live DATABASE_URL (today, until the owner runs `db:push` +
 * `db:seed-courses`), every write below resolves `{ ok: false, message:
 * 'db_required' }` — surfaced through the SAME generic error UI these
 * actions already had (no crash, no new UI). The public site is unaffected
 * either way: it keeps serving the 9 static courses via source.ts's fallback.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import * as writeOps from '@/lib/courses/write';
import { getAdminCourse } from '@/lib/courses/write';
import type { CoursePatch, LessonPatch, NewCourseInput, ChapterPatch } from '@/lib/courses/write';
import type { AdminActor } from '@/lib/admin/data/types';
import { createBunnyVideo, bunnyUploadConfigured, type BunnyUploadResult } from '@/lib/bunny/upload';

export type ContentResult = { ok: boolean; message?: string; slug?: string; count?: number };

async function requireEditor(): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'courses.edit')) throw new Error('forbidden');
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { id: userId, name };
}

/**
 * Task C3 fix: publish/unpublish/delete are MODERATION acts now, not plain
 * content edits — gated on `teachers.review` (mirrors
 * `lib/courses/review-actions.ts`'s `requireReviewer`, duplicated locally
 * rather than imported so this file's auth story stays self-contained, same
 * as `requireEditor` above). An `editeur-contenu` (has `courses.edit`, not
 * `teachers.review`) can still draft/edit course content via
 * `updateCourseAction`, but can no longer one-click push any course live,
 * take it down, or delete it — that bypassed the review queue entirely.
 */
async function requireModerator(): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'teachers.review')) throw new Error('forbidden');
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { id: userId, name };
}

function fail(e: unknown): ContentResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

/* ------------------------------- course ---------------------------------- */
export async function createCourseAction(input: NewCourseInput): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    if (!input.title_fr?.trim() && !input.title_ht?.trim()) return { ok: false, message: 'title_required' };
    return await writeOps.createCourse(input, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function updateCourseAction(slug: string, patch: CoursePatch): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.updateCourse(slug, patch, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function publishCourseAction(slug: string): Promise<ContentResult> {
  try {
    const actor = await requireModerator();
    return await writeOps.publishCourse(slug, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function unpublishCourseAction(slug: string): Promise<ContentResult> {
  try {
    const actor = await requireModerator();
    return await writeOps.unpublishCourse(slug, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCourseAction(slug: string, confirmCode: string): Promise<ContentResult> {
  try {
    const actor = await requireModerator();
    // write.ts's deleteCourse does the real enrollment-count + code-match guard.
    return await writeOps.deleteCourse(slug, confirmCode, actor);
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- lessons --------------------------------- */
export async function addLessonAction(slug: string): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.addLesson(slug, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function updateLessonAction(slug: string, lessonId: string, patch: LessonPatch): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.updateLesson(slug, lessonId, patch, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLessonAction(slug: string, lessonId: string): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.deleteLesson(slug, lessonId, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function moveLessonAction(slug: string, lessonId: string, dir: 'up' | 'down'): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.reorderLessons(slug, lessonId, dir, actor);
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- chapters --------------------------------- */
/** Task K1 (plan de cours complet) — same `courses.edit` gate as the lesson mutations above. */
export async function createChapterAction(
  slug: string,
  input: { title_ht: string; title_fr: string },
): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.createChapter(slug, input, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function updateChapterAction(slug: string, chapterId: string, patch: ChapterPatch): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.updateChapter(slug, chapterId, patch, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteChapterAction(slug: string, chapterId: string): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.deleteChapter(slug, chapterId, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function reorderChapterAction(slug: string, chapterId: string, dir: 'up' | 'down'): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.reorderChapters(slug, chapterId, dir, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function moveLessonToChapterAction(
  slug: string,
  lessonId: string,
  chapterId: string | null,
): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    return await writeOps.moveLessonToChapter(slug, lessonId, chapterId, actor);
  } catch (e) {
    return fail(e);
  }
}

/** Stub: validate a Bunny video id. Real check needs BUNNY_STREAM_API_KEY + LIBRARY_ID. */
export async function validateBunnyVideoAction(videoId: string): Promise<ContentResult> {
  try {
    await requireEditor();
    if (!videoId.trim()) return { ok: false, message: 'empty' };
    if (!process.env.BUNNY_STREAM_API_KEY) return { ok: true, message: 'unvalidated_mock' };
    // Production:
    //   GET https://video.bunnycdn.com/library/{LIBRARY_ID}/videos/{videoId}
    //   headers: { AccessKey: process.env.BUNNY_STREAM_API_KEY }
    //   → 200 = exists, 404 = invalid id.
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Autonomous direct-to-Bunny upload (admin CMS path): gated the same as
 * every other content edit (`requireEditor` → `courses.edit`), then creates
 * the video object in the owner's Bunny library and returns the TUS
 * upload-authorization payload for the BROWSER to use — see
 * lib/bunny/upload.ts's file header for why the API key itself never
 * appears in this return value. `slug`/`lessonId` aren't sent to Bunny (a
 * video object doesn't belong to a course there); they're accepted so the
 * caller's shape matches `updateLessonAction` and so a future audit trail
 * can log which lesson an upload was meant for.
 */
export async function createVideoUploadAction(
  // slug/lessonId aren't sent to Bunny (see doc comment above) — kept in the
  // signature so this matches updateLessonAction's shape and every call
  // site can pass the same three args regardless of which action runs.
  _slug: string,
  _lessonId: string,
  title: string,
): Promise<BunnyUploadResult> {
  try {
    await requireEditor();
    if (!bunnyUploadConfigured()) return { ok: false, message: 'not_configured' };
    return await createBunnyVideo(title);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'error' };
  }
}

/* -------------------------------- images --------------------------------- */
/**
 * Each of these four reads the course's current images, computes the new
 * array in JS, then calls `writeOps.setCourseImages` (full replace) — see
 * that function's doc comment for why no per-image id is persisted.
 */
export async function setMainImageAction(slug: string, url: string): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    const course = await getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const secondary = course.secondaryImages.map((i) => ({ url: i.url, alt: i.alt }));
    return await writeOps.setCourseImages(slug, { main: url.trim() || null, secondary }, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function addSecondaryImageAction(slug: string, url: string, alt: string): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    if (!url.trim()) return { ok: false, message: 'empty' };
    const course = await getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    // Production: upload the file to Bunny Storage + resize server-side (sharp,
    // max 1200px, WebP), then store the returned CDN url. Here we store the url.
    const secondary = [...course.secondaryImages.map((i) => ({ url: i.url, alt: i.alt })), { url: url.trim(), alt: alt.trim() }];
    return await writeOps.setCourseImages(slug, { main: course.mainImage, secondary }, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function removeSecondaryImageAction(slug: string, imageId: string): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    const course = await getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const secondary = course.secondaryImages.filter((i) => i.id !== imageId).map((i) => ({ url: i.url, alt: i.alt }));
    return await writeOps.setCourseImages(slug, { main: course.mainImage, secondary }, actor);
  } catch (e) {
    return fail(e);
  }
}

export async function moveSecondaryImageAction(slug: string, imageId: string, dir: 'up' | 'down'): Promise<ContentResult> {
  try {
    const actor = await requireEditor();
    const course = await getAdminCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const i = course.secondaryImages.findIndex((x) => x.id === imageId);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= course.secondaryImages.length) return { ok: false, message: 'invalid_move' };
    const reordered = [...course.secondaryImages];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const secondary = reordered.map((im) => ({ url: im.url, alt: im.alt }));
    return await writeOps.setCourseImages(slug, { main: course.mainImage, secondary }, actor);
  } catch (e) {
    return fail(e);
  }
}
