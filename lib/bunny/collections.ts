/**
 * lib/bunny/collections.ts — server-only helpers for AUTOMATIC per-course
 * Bunny Stream "Collection" organization (owner asked: "is it organized like
 * Udemy, is it all automatic?"). Today every uploaded video lands in one
 * flat library; `ensureCourseCollection` groups a course's videos into a
 * single Bunny Collection the FIRST time a lesson video is uploaded for that
 * course, and reuses/re-verifies it on every later upload — so the Bunny
 * dashboard mirrors the course catalog (one collection per course) instead
 * of a single unsearchable pile.
 *
 * ENV-GATED, same choke point as lib/bunny/upload.ts: reuses that module's
 * `bunnyUploadConfigured()` (both `BUNNY_STREAM_API_KEY` and
 * `BUNNY_STREAM_LIBRARY_ID` required) rather than re-deriving the same gate
 * a second time.
 *
 * BEST-EFFORT (the property everything here is subordinate to): organization
 * must never be the reason a video upload fails. Every exported function
 * NEVER throws — every failure path (not configured, network error, timeout,
 * bad response, missing guid) resolves `{ ok: false, message }`, and the
 * caller (lib/bunny/organize.ts) proceeds with the upload WITHOUT a
 * collection when this fails.
 *
 * SECURITY: the API key is read from `process.env` at call time only, used
 * solely for the `AccessKey` header on server-to-server calls to Bunny's
 * collections REST endpoints — never returned, logged, or embedded in a URL.
 */
import { bunnyUploadConfigured } from './upload';

export type EnsureCollectionResult = { ok: true; collectionId: string } | { ok: false; message: string };

const REQUEST_TIMEOUT_MS = 10_000;

/** Bunny doesn't document a hard collection-name cap; 100 chars is a
 *  conservative limit that keeps the label readable in the dashboard's
 *  collection picker/sidebar. Exported so the unit tests can assert the
 *  exact boundary without duplicating the magic number. */
export const BUNNY_COLLECTION_NAME_MAX_LENGTH = 100;

function credentials(): { key: string; libraryId: string } | null {
  const key = process.env.BUNNY_STREAM_API_KEY?.trim();
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  if (!key || !libraryId) return null;
  return { key, libraryId };
}

/**
 * Builds the readable, sortable collection label — e.g.
 * `"PA-03 · Byen Konprann Kredi — PNICE Academy"`. Falls back gracefully when
 * `courseCode`/`teacherName` are unknown (omits the code segment; substitutes
 * "PNICE Academy" for a blank teacher name, since that's the platform's own
 * default teacher — see data/teachers.ts). Pure — exported for unit testing
 * without a DB or Bunny credentials.
 */
export function buildCollectionName(params: {
  courseCode: string | null;
  courseTitle: string;
  teacherName: string;
}): string {
  const code = params.courseCode?.trim();
  const title = params.courseTitle.trim() || 'San tit';
  const teacher = params.teacherName.trim() || 'PNICE Academy';
  const name = code ? `${code} · ${title} — ${teacher}` : `${title} — ${teacher}`;
  return name.length > BUNNY_COLLECTION_NAME_MAX_LENGTH
    ? `${name.slice(0, BUNNY_COLLECTION_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : name;
}

/** `true` iff Bunny still recognizes this collection id (a cheap GET) — a
 *  collection the owner deleted directly in the Bunny dashboard 404s here,
 *  which tells `ensureCourseCollection` to recreate rather than reuse a
 *  dangling guid. Never throws: any error (network, timeout) is treated the
 *  same as "doesn't exist" — worst case we create a harmless duplicate
 *  collection, which is far safer than silently uploading unorganized. */
async function collectionStillExists(libraryId: string, key: string, collectionId: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/collections/${collectionId}`, {
      headers: { AccessKey: key, accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function createCollection(libraryId: string, key: string, name: string): Promise<EnsureCollectionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/collections`, {
      method: 'POST',
      headers: { AccessKey: key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, message: `HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}` };
    }
    const data = (await res.json().catch(() => null)) as { guid?: string } | null;
    if (!data?.guid) return { ok: false, message: 'no_guid' };
    return { ok: true, collectionId: data.guid };
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'Timeout (10s)' : e.message) : 'error';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ensures a course has a Bunny Collection, creating one on first use and
 * reusing/re-verifying it afterwards. NEVER throws; `{ ok: false, message }`
 * on any failure (including "not configured") — the caller must treat that
 * as "proceed without a collection", not as a reason to fail the upload.
 *
 * - `existingCollectionId` set → cheap GET to confirm it still exists in
 *   Bunny (the owner may have deleted it directly in the dashboard); reused
 *   if so, recreated if not (404/any error).
 * - `existingCollectionId` null → creates a new collection named via
 *   `buildCollectionName`.
 */
export async function ensureCourseCollection(params: {
  slug: string;
  courseCode: string | null;
  courseTitle: string;
  teacherName: string;
  existingCollectionId: string | null;
}): Promise<EnsureCollectionResult> {
  if (!bunnyUploadConfigured()) return { ok: false, message: 'not_configured' };
  const creds = credentials();
  if (!creds) return { ok: false, message: 'not_configured' };
  const { key, libraryId } = creds;

  if (params.existingCollectionId) {
    const stillExists = await collectionStillExists(libraryId, key, params.existingCollectionId);
    if (stillExists) return { ok: true, collectionId: params.existingCollectionId };
    // Falls through to recreate — the stored guid no longer resolves in Bunny.
  }

  const name = buildCollectionName({
    courseCode: params.courseCode,
    courseTitle: params.courseTitle,
    teacherName: params.teacherName,
  });
  return await createCollection(libraryId, key, name);
}
