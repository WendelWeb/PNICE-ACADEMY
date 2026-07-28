/**
 * lib/bunny/upload.ts — server-only helpers for AUTONOMOUS direct-to-Bunny
 * video upload. Goal: a teacher/admin picks a file in the studio/CMS and it
 * lands in the platform's Bunny Stream library with zero manual GUID
 * copying and WITHOUT the browser ever holding the Bunny API key.
 *
 * ENV-GATED, same choke point as lib/admin/health/bunny.ts and
 * lib/bunny/embed.ts: `bunnyUploadConfigured()` requires BOTH
 * `BUNNY_STREAM_API_KEY` and `BUNNY_STREAM_LIBRARY_ID`; missing either
 * resolves `{ ok: false, message: 'not_configured' }` from
 * `createBunnyVideo`, never a throw.
 *
 * SECURITY (the one property everything else here is subordinate to): the
 * API key is read from `process.env` at call time only, used to (a) call
 * Bunny's create-video REST endpoint server-side and (b) compute a SHA256
 * "TUS" upload-authorization signature server-side. Neither the key nor
 * anything the caller could reverse it from is ever returned, logged, or
 * embedded in a URL — `createBunnyVideo`'s success payload is exactly
 * `{ guid, libraryId, signature, expire, tusEndpoint }`, a time-boxed
 * (1 hour), single-video, upload-only credential. The BROWSER uses that
 * payload to PUT the video bytes straight to Bunny (see
 * components/content/VideoUpload.tsx) — the server never proxies the file.
 *
 * WHY NOT PUT: Bunny's plain `PUT /library/{id}/videos/{guid}` upload
 * requires the raw `AccessKey` header — fine server-to-server, but it would
 * leak the secret if called from the browser. Bunny's TUS endpoint
 * (`https://video.bunnycdn.com/tusupload`) instead accepts a *signature*
 * derived from the key (not the key itself), scoped to one video and one
 * expiry window — that's the one Bunny surface actually safe to call from
 * client JS, which is why this file computes it instead of returning the
 * key.
 */
import { createHash } from 'node:crypto';

export type BunnyUploadInit = {
  ok: true;
  guid: string;
  libraryId: string;
  signature: string;
  expire: number;
  tusEndpoint: string;
};
export type BunnyUploadFailure = { ok: false; message: string };
export type BunnyUploadResult = BunnyUploadInit | BunnyUploadFailure;

/** Bunny's shared TUS resumable-upload endpoint (same URL for every library/video — routed by the VideoId/LibraryId headers). */
export const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

const CREATE_VIDEO_TIMEOUT_MS = 15_000;
/** How long the signature returned to the browser stays valid. */
const EXPIRE_WINDOW_SECONDS = 3600;

/** True once the owner has set BOTH Bunny Stream env vars. Mirrors the gating style of checkBunnyStream/bunnyConfigured. */
export function bunnyUploadConfigured(): boolean {
  return Boolean(process.env.BUNNY_STREAM_API_KEY?.trim() && process.env.BUNNY_STREAM_LIBRARY_ID?.trim());
}

/**
 * Pure function, extracted for unit testing (see lib/bunny/upload.test.ts):
 * Bunny's documented TUS `AuthorizationSignature` is
 * `sha256hex(libraryId + apiKey + expirationTimestamp + videoId)` — a plain
 * concatenation, no delimiter, no JSON. Exported so tests can assert the
 * exact shape/determinism without needing a real key or network access;
 * nothing in this codebase calls it with a real key from anywhere but
 * `createBunnyVideo` below.
 */
export function bunnyTusSignature(libraryId: string, apiKey: string, expire: number, videoGuid: string): string {
  return createHash('sha256').update(`${libraryId}${apiKey}${expire}${videoGuid}`).digest('hex');
}

/**
 * Creates a new (empty) video object in the owner's Bunny Stream library —
 * `POST /library/{libraryId}/videos` with the `AccessKey` header, server
 * side only — then computes the TUS authorization the BROWSER needs to
 * upload the actual bytes straight to Bunny. Never throws: every failure
 * path (not configured, network error, timeout, bad response) resolves
 * `{ ok: false, message }`, mirroring checkBunnyStream's error shape.
 */
export async function createBunnyVideo(title: string): Promise<BunnyUploadResult> {
  const key = process.env.BUNNY_STREAM_API_KEY?.trim();
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  if (!key || !libraryId) return { ok: false, message: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CREATE_VIDEO_TIMEOUT_MS);
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: 'POST',
      headers: { AccessKey: key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ title: title.trim() || 'Sans titre' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, message: `HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}` };
    }
    const data = (await res.json().catch(() => null)) as { guid?: string } | null;
    const guid = data?.guid;
    if (!guid) return { ok: false, message: 'no_guid' };

    const expire = Math.floor(Date.now() / 1000) + EXPIRE_WINDOW_SECONDS;
    const signature = bunnyTusSignature(libraryId, key, expire, guid);

    return { ok: true, guid, libraryId, signature, expire, tusEndpoint: BUNNY_TUS_ENDPOINT };
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'Timeout (15s)' : e.message) : 'error';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}
