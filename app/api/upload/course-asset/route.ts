/**
 * POST /api/upload/course-asset — receives ONE file (course image or
 * downloadable resource) as multipart formData `{ file, slug, purpose }`,
 * validates it, and stores it in the platform's Bunny Storage Zone. This is
 * a ROUTE HANDLER (not a server action) on purpose: server actions cap the
 * request body at ~1 MB, while course assets go up to ASSET_MAX_BYTES (4 MB
 * each). The 4 MB ceiling is deliberate (review fix): the production
 * platform (Vercel) rejects serverless request bodies over ~4.5 MB with a
 * non-JSON 413 BEFORE this handler runs, so the cap — and the teacher-facing
 * copy — must stay under that or every larger file fails with a generic,
 * misleading error.
 *
 * RESPONSE CONTRACT (never-throw, mirrors the server-action result shape the
 * studio/CMS clients already speak): ALWAYS HTTP 200 with
 * `{ ok: true, url }` on success or `{ ok: false, message: <code> }` on any
 * failure — 'not_configured' (missing Bunny Storage or Clerk env; degraded,
 * not broken), 'unauthorized', 'forbidden', 'db_required', 'not_found',
 * 'bad_request', plus lib/uploads/course-asset.ts's validation codes
 * ('unsupported_type', 'too_large', 'content_mismatch', …). No throw, no
 * 500 leak, no technical detail for the UI to accidentally show a teacher.
 *
 * AUTHORIZATION — the same dual gate as autonomous video upload
 * (lib/admin/content-actions.ts `createVideoUploadAction` = admin arm,
 * lib/teacher/studio-actions.ts `createMyVideoUploadAction` = teacher arm):
 * the caller must EITHER hold the admin `courses.edit` capability OR be an
 * APPROVED teacher who OWNS the course `slug` points at
 * (`courses.owner_user_id` equals their internal users.id). A teacher can
 * only ever land files under a course they own; only after the gate passes
 * do we touch Bunny at all.
 *
 * VALIDATION is server-side and content-based: declared MIME + size + magic
 * bytes, all factored into the pure `validateCourseAsset`
 * (lib/uploads/course-asset.ts) so it's unit-tested without this route. The
 * stored path is built by `buildCourseAssetPath` — never from raw client
 * input (traversal-proof, extension forced from the VALIDATED MIME).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { clerkEnabled } from '@/lib/clerk';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { getTeacherProfile, isApprovedTeacher } from '@/lib/teacher/profile';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { recordAudit } from '@/lib/admin/data/real/users';
import type { AdminActor } from '@/lib/admin/data/types';
import { bunnyStorageConfigured, uploadToBunnyStorage } from '@/lib/bunny/storage';
import {
  validateCourseAsset,
  buildCourseAssetPath,
  buildProfileAssetPath,
  ASSET_MAX_BYTES,
  ASSET_SNIFF_HEAD_BYTES,
} from '@/lib/uploads/course-asset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const T = schema;

type UploadResponse = { ok: true; url: string } | { ok: false; message: string };

function respond(body: UploadResponse) {
  // Always HTTP 200 — see the response contract in the file header.
  return NextResponse.json(body);
}

type Gate = { ok: true; actor: AdminActor; targetUserId: string } | { ok: false; message: string };

/**
 * The dual gate (see file header). Admin arm first — it needs no DB, so an
 * admin can upload even before DATABASE_URL exists (mirrors
 * `createVideoUploadAction`, whose whole gate is `requireEditor`). Any
 * Clerk lookup failure falls through to the teacher arm rather than
 * erroring — the stricter, DB-backed ownership check.
 */
async function authorizeUpload(clerkId: string, slug: string): Promise<Gate> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkId);
    const role = resolveAdminRole(user);
    if (role && can(role, 'courses.edit')) {
      const name =
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || clerkId;
      return { ok: true, actor: { id: clerkId, name }, targetUserId: clerkId };
    }
  } catch {
    /* not an admin (or Clerk hiccup) — try the teacher-ownership arm */
  }

  if (!dbConfigured()) return { ok: false, message: 'db_required' };
  const userId = await resolveUserId(clerkId);
  if (!userId) return { ok: false, message: 'unauthorized' };
  if (!(await isApprovedTeacher(userId))) return { ok: false, message: 'forbidden' };

  // Same ownership core as studio-actions' requireOwnedCourse: the course
  // must exist AND be owned by THIS teacher — never a write on the wrong row.
  const [course] = await db
    .select({ ownerUserId: T.courses.ownerUserId })
    .from(T.courses)
    .where(eq(T.courses.slug, slug))
    .limit(1);
  if (!course) return { ok: false, message: 'not_found' };
  if (course.ownerUserId !== userId) return { ok: false, message: 'forbidden' };

  const profile = await getTeacherProfile(userId);
  return { ok: true, actor: { id: userId, name: profile?.displayName || 'Anseyan' }, targetUserId: userId };
}

export async function POST(req: NextRequest) {
  try {
    if (!bunnyStorageConfigured() || !clerkEnabled) return respond({ ok: false, message: 'not_configured' });

    const { userId: clerkId } = await auth();
    if (!clerkId) return respond({ ok: false, message: 'unauthorized' });

    const form = await req.formData().catch(() => null);
    if (!form) return respond({ ok: false, message: 'bad_request' });
    const file = form.get('file');
    const slug = String(form.get('slug') ?? '').trim();
    const purpose = String(form.get('purpose') ?? '').trim();
    // Stage 7 — the apply wizard's profile-photo purpose is USER-scoped, not
    // course-scoped: an applicant uploading a profile photo has no course
    // (sometimes no `teacher_profiles` row) yet, so `slug` doesn't apply.
    const isProfile = purpose === 'profile';
    if (!(file instanceof Blob) || (!isProfile && !slug)) return respond({ ok: false, message: 'bad_request' });

    // Absolute cap before anything else — nobody, admin included, streams
    // more than the largest allowed asset through this route.
    if (file.size > ASSET_MAX_BYTES.resource) return respond({ ok: false, message: 'too_large' });

    // Profile-photo gate: any SIGNED-IN user, scoped to their own Clerk id —
    // no admin role, no approved-teacher status, no course ownership check
    // (see file header's dual gate; this is a THIRD, deliberately simpler
    // arm, only reachable for purpose='profile'). No DB touch needed either:
    // the path is scoped by the Clerk id itself.
    const gate = isProfile
      ? ({ ok: true, actor: { id: clerkId, name: clerkId }, targetUserId: clerkId } as Gate)
      : await authorizeUpload(clerkId, slug);
    if (!gate.ok) return respond({ ok: false, message: gate.message });

    const bytes = await file.arrayBuffer();
    const checked = validateCourseAsset({
      // A profile photo is validated exactly like a course image (same MIME/
      // size/magic-byte rules) — only the STORED PATH differs (see below).
      purpose: isProfile ? 'image' : purpose,
      mime: file.type,
      size: file.size,
      head: new Uint8Array(bytes.slice(0, ASSET_SNIFF_HEAD_BYTES)),
    });
    if (!checked.ok) return respond({ ok: false, message: checked.message });

    const path = isProfile
      ? buildProfileAssetPath({
          userId: gate.targetUserId,
          fileName: file instanceof File ? file.name : '',
          mime: checked.mime,
        })
      : buildCourseAssetPath({
          slug,
          purpose: checked.purpose,
          fileName: file instanceof File ? file.name : '',
          mime: checked.mime,
        });

    const uploaded = await uploadToBunnyStorage(path, bytes, checked.mime);
    if (!uploaded.ok) return respond(uploaded);

    // Audit trail — same helper the studio actions use (recordAudit), best
    // effort: a logging hiccup must never fail an upload that succeeded.
    if (dbConfigured()) {
      try {
        await recordAudit({
          action: isProfile ? 'upload_profile_photo' : 'upload_course_asset',
          userId: gate.targetUserId,
          admin: gate.actor,
          detail: `${checked.purpose}:${path}`,
        });
      } catch (e) {
        console.error('[upload/course-asset] audit write failed (non-fatal):', e);
      }
    }

    return respond({ ok: true, url: uploaded.url });
  } catch (e) {
    console.error('[upload/course-asset] failed:', e);
    return respond({ ok: false, message: 'error' });
  }
}
