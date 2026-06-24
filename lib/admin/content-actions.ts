'use server';

/**
 * CMS content server actions (Phase C). All gated on `courses.edit`. Mutate the
 * in-memory content store (lib/admin/content). The public site is NOT affected
 * (owner decision: static public + admin preview); real reflection lands with DB.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { getMockDataset } from '@/lib/admin/data/mock/dataset';
import * as ops from '@/lib/admin/content/ops';
import { getCourse } from '@/lib/admin/content/ops';
import type { CoursePatch, NewCourseInput } from '@/lib/admin/content/ops';
import type { ContentLesson } from '@/lib/admin/content/store';

export type ContentResult = { ok: boolean; message?: string; slug?: string; count?: number };

async function requireEditor(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'courses.edit')) throw new Error('forbidden');
}

function fail(e: unknown): ContentResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

function enrollmentCount(slug: string): number {
  return getMockDataset().enrollments.filter((e) => e.courseSlug === slug).length;
}

/* ------------------------------- course ---------------------------------- */
export async function createCourseAction(input: NewCourseInput): Promise<ContentResult> {
  try {
    await requireEditor();
    if (!input.title_fr?.trim() && !input.title_ht?.trim()) return { ok: false, message: 'title_required' };
    const { slug } = ops.createCourse(input);
    return { ok: true, slug };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCourseAction(slug: string, patch: CoursePatch): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.updateCourse(slug, patch) };
  } catch (e) {
    return fail(e);
  }
}

export async function publishCourseAction(slug: string): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.publishCourse(slug) };
  } catch (e) {
    return fail(e);
  }
}

export async function unpublishCourseAction(slug: string): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.unpublishCourse(slug) };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCourseAction(slug: string, confirmCode: string): Promise<ContentResult> {
  try {
    await requireEditor();
    const course = getCourse(slug);
    if (!course) return { ok: false, message: 'not_found' };
    const count = enrollmentCount(slug);
    if (count > 0) return { ok: false, message: 'has_enrollments', count };
    if (confirmCode.trim().toUpperCase() !== course.code.toUpperCase()) {
      return { ok: false, message: 'code_mismatch' };
    }
    return { ok: ops.deleteCourse(slug) };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- lessons --------------------------------- */
export async function addLessonAction(slug: string): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.addLesson(slug) };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLessonAction(slug: string, lessonId: string, patch: Partial<ContentLesson>): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.updateLesson(slug, lessonId, patch) };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLessonAction(slug: string, lessonId: string): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.deleteLesson(slug, lessonId) };
  } catch (e) {
    return fail(e);
  }
}

export async function moveLessonAction(slug: string, lessonId: string, dir: 'up' | 'down'): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.moveLesson(slug, lessonId, dir) };
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

/* -------------------------------- images --------------------------------- */
export async function setMainImageAction(slug: string, url: string): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.setMainImage(slug, url.trim() || null) };
  } catch (e) {
    return fail(e);
  }
}

export async function addSecondaryImageAction(slug: string, url: string, alt: string): Promise<ContentResult> {
  try {
    await requireEditor();
    if (!url.trim()) return { ok: false, message: 'empty' };
    // Production: upload the file to Bunny Storage + resize server-side (sharp,
    // max 1200px, WebP), then store the returned CDN url. Here we store the url.
    return { ok: ops.addSecondaryImage(slug, url.trim(), alt.trim()) };
  } catch (e) {
    return fail(e);
  }
}

export async function removeSecondaryImageAction(slug: string, imageId: string): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.removeSecondaryImage(slug, imageId) };
  } catch (e) {
    return fail(e);
  }
}

export async function moveSecondaryImageAction(slug: string, imageId: string, dir: 'up' | 'down'): Promise<ContentResult> {
  try {
    await requireEditor();
    return { ok: ops.moveSecondaryImage(slug, imageId, dir) };
  } catch (e) {
    return fail(e);
  }
}
