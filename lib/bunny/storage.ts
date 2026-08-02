/**
 * lib/bunny/storage.ts — server-only helpers for Bunny STORAGE (files:
 * course images, downloadable resources), the sibling of lib/bunny/upload.ts
 * (which handles Bunny STREAM, videos). Goal: a teacher/admin picks a photo
 * or PDF on their phone and it lands in the platform's Storage Zone, served
 * back through the connected Pull Zone (CDN) — no URL pasting, and WITHOUT
 * the browser ever holding the Storage API key.
 *
 * ENV-GATED, same choke point pattern as bunnyUploadConfigured():
 * `bunnyStorageConfigured()` requires ALL THREE of
 * `BUNNY_STORAGE_ZONE_NAME`, `BUNNY_STORAGE_API_KEY` and
 * `BUNNY_STORAGE_CDN_BASE`; missing any resolves
 * `{ ok: false, message: 'not_configured' }` from `uploadToBunnyStorage`,
 * never a throw. The app keeps working fully without them (URL-paste
 * fallback / degraded UI — never broken).
 *
 * SECURITY (the one property everything else here is subordinate to): the
 * Storage API key is read from `process.env` at call time only and sent
 * solely as the `AccessKey` header of server-to-server PUT/DELETE calls to
 * `storage.bunnycdn.com`. It is never returned, never logged, never part of
 * any URL — the success payload is exactly `{ ok: true, url }` where `url`
 * is the PUBLIC CDN address (Pull Zone) of the stored object. Unlike Bunny
 * Stream there is no signature scheme for Storage, so the file bytes are
 * proxied THROUGH our route handler (app/api/upload/course-asset/route.ts)
 * instead of uploaded straight from the browser — that route also owns
 * auth + validation; this module only does transport.
 *
 * PATHS: callers must build paths with `buildCourseAssetPath`
 * (lib/uploads/course-asset.ts). As defence in depth this module STILL
 * refuses any path that is empty, absolute, contains `..`, or steps outside
 * the [a-z0-9-_./] whitelist — the choke point stays safe even if a future
 * caller forgets the builder.
 */

export type BunnyStorageResult = { ok: true; url: string } | { ok: false; message: string };

const STORAGE_TIMEOUT_MS = 30_000;

/** Default global endpoint; `BUNNY_STORAGE_HOST` (optional) overrides it for zones created in a non-default region (e.g. ny.storage.bunnycdn.com). */
const DEFAULT_STORAGE_HOST = 'storage.bunnycdn.com';

function storageHost(): string {
  return process.env.BUNNY_STORAGE_HOST?.trim() || DEFAULT_STORAGE_HOST;
}

/** True once the owner has set all three Bunny Storage env vars. Mirrors bunnyUploadConfigured's gating style. */
export function bunnyStorageConfigured(): boolean {
  return Boolean(
    process.env.BUNNY_STORAGE_ZONE_NAME?.trim() &&
      process.env.BUNNY_STORAGE_API_KEY?.trim() &&
      process.env.BUNNY_STORAGE_CDN_BASE?.trim(),
  );
}

/** Defence in depth (see file header) — true only for pre-sanitized relative paths. */
function safeStoragePath(path: string): boolean {
  return Boolean(path) && !path.startsWith('/') && !path.includes('..') && /^[a-z0-9\-_./]+$/.test(path);
}

/**
 * The public CDN base, normalised: trimmed, trailing slashes removed, and
 * `https://` prepended when the owner pasted a bare hostname
 * (`pnice-assets.b-cdn.net`) — minimal-computer-literacy ops must not break
 * on a missing protocol.
 */
function cdnBase(): string {
  let base = (process.env.BUNNY_STORAGE_CDN_BASE || '').trim().replace(/\/+$/, '');
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base;
}

/**
 * Uploads one object — `PUT https://{host}/{zone}/{path}` with the
 * `AccessKey` header, server side only. Never throws: every failure path
 * (not configured, bad path, network error, timeout, non-OK response)
 * resolves `{ ok: false, message }`, mirroring createBunnyVideo's contract.
 * Success resolves the object's PUBLIC CDN url (never anything derived from
 * the key).
 */
export async function uploadToBunnyStorage(
  path: string,
  bytes: ArrayBuffer | Buffer,
  contentType: string,
): Promise<BunnyStorageResult> {
  const zone = process.env.BUNNY_STORAGE_ZONE_NAME?.trim();
  const key = process.env.BUNNY_STORAGE_API_KEY?.trim();
  const base = cdnBase();
  if (!zone || !key || !base) return { ok: false, message: 'not_configured' };
  if (!safeStoragePath(path)) return { ok: false, message: 'bad_path' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://${storageHost()}/${zone}/${path}`, {
      method: 'PUT',
      headers: {
        AccessKey: key,
        'content-type': contentType || 'application/octet-stream',
        accept: 'application/json',
      },
      // A Node Buffer IS a Uint8Array at runtime; TS's DOM BodyInit just
      // can't unify Buffer's ArrayBufferLike generic — narrow it, no copy.
      body: bytes instanceof ArrayBuffer ? bytes : (bytes as Uint8Array<ArrayBuffer>),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, message: `HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}` };
    }
    return { ok: true, url: `${base}/${path}` };
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'Timeout (30s)' : e.message) : 'error';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Orphan cleanup — `DELETE https://{host}/{zone}/{path}`. BEST-EFFORT,
 * mirroring deleteBunnyVideo's contract exactly: NEVER throws AND never
 * needs its result checked (`Promise<void>`) — every failure (not
 * configured, unsafe path, network error, timeout, non-OK response) is
 * logged here and swallowed. Callers run this AFTER their own DB write
 * already succeeded — a failed Storage delete must never undo or block the
 * mutation that triggered it.
 */
export async function deleteFromBunnyStorage(path: string): Promise<void> {
  const zone = process.env.BUNNY_STORAGE_ZONE_NAME?.trim();
  const key = process.env.BUNNY_STORAGE_API_KEY?.trim();
  const clean = path?.trim();
  if (!zone || !key || !clean || !safeStoragePath(clean)) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://${storageHost()}/${zone}/${clean}`, {
      method: 'DELETE',
      headers: { AccessKey: key, accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(
        `[bunny/storage] deleteFromBunnyStorage(${clean}) failed (non-fatal, file left in storage): HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`,
      );
    }
  } catch (e) {
    console.error(`[bunny/storage] deleteFromBunnyStorage(${clean}) failed (non-fatal, file left in storage):`, e);
  } finally {
    clearTimeout(timer);
  }
}
