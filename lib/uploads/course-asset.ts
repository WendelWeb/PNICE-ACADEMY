/**
 * lib/uploads/course-asset.ts — PURE validation + path building for course
 * asset uploads (course images, downloadable resources) headed to Bunny
 * Storage via app/api/upload/course-asset/route.ts. Zero imports, zero I/O —
 * every function here is deterministic-ish (the path stamp excepted) and
 * unit-tested without network or DB (see course-asset.test.ts), mirroring
 * how lib/bunny/upload.ts extracts `bunnyTusSignature` for testing.
 *
 * SECURITY (why this file exists at all): the route accepts a client-chosen
 * file name, MIME type and byte stream — all three are attacker-controlled.
 * The rules, in order of importance:
 *
 *  1. The STORED PATH never contains anything the client typed verbatim:
 *     `buildCourseAssetPath` whitelists [a-z0-9-_.], strips path separators
 *     and leading dots (no `../` traversal, no hidden files), collapses
 *     repeats and caps length.
 *  2. The SERVED EXTENSION comes from the VALIDATED MIME, never from the
 *     client file name — a `.html` or `.exe` renamed to sneak past the
 *     picker is stored with the extension its (verified) content deserves.
 *  3. Declared MIME is checked against MAGIC BYTES for every sniffable type
 *     (jpeg/png/webp/pdf/zip — the OOXML docx/xlsx/pptx family are zip
 *     containers, so they must sniff as zip): a file claiming `image/png`
 *     whose bytes are not a PNG is refused (`content_mismatch`).
 *  4. SVG is deliberately NOT accepted as an image — inline scripts in SVG
 *     are an XSS vector when served from the CDN.
 *
 * Every failure message is a short machine code ('too_large', …) — the UI
 * layers of later stages translate them; nothing here is shown raw to a
 * teacher.
 */

export type AssetPurpose = 'image' | 'resource';

/** Per-purpose size caps (bytes): a course image ≤ 8 MB, a resource ≤ 25 MB. */
export const ASSET_MAX_BYTES: Record<AssetPurpose, number> = {
  image: 8 * 1024 * 1024,
  resource: 25 * 1024 * 1024,
};

/** How many leading bytes `validateCourseAsset` needs to sniff magic bytes. */
export const ASSET_SNIFF_HEAD_BYTES = 16;

/**
 * MIME → stored/served extension. THE only source of extensions in a stored
 * path (rule 2 above). `application/x-zip-compressed` is what Windows
 * browsers commonly declare for .zip — normalised to `application/zip`
 * before this table is consulted.
 */
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
};

/** Allowed (normalised) MIME types per purpose. */
export const ASSET_ALLOWED_MIME: Record<AssetPurpose, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  resource: [
    'application/pdf',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
};

/** Lowercase, drop any `; charset=…` suffix, map the Windows zip alias. */
function normalizeMime(mime: string): string {
  const clean = (mime || '').split(';')[0].trim().toLowerCase();
  return clean === 'application/x-zip-compressed' ? 'application/zip' : clean;
}

type SniffKind = 'jpeg' | 'png' | 'webp' | 'pdf' | 'zip';

/**
 * Declared MIME → the magic-byte kind its content MUST match (rule 3).
 * MIMEs absent from this table (legacy .doc/.xls/.ppt OLE containers,
 * text/plain — no reliable universal magic) skip the content check; they are
 * still extension-forced and size-capped.
 */
const SNIFF_REQUIRED: Record<string, SniffKind> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'zip',
};

/**
 * Hand-rolled header sniff (no dependency): identifies the five formats we
 * can verify from their first bytes. Returns null when nothing matches.
 */
export function sniffAssetHead(head: Uint8Array): SniffKind | null {
  const at = (i: number) => (i < head.length ? head[i] : -1);
  // JPEG: FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return 'png';
  }
  // WEBP: 'RIFF' …4 size bytes… 'WEBP'
  if (
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) {
    return 'webp';
  }
  // PDF: '%PDF'
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'pdf';
  // ZIP: 'PK' + 03 04 (normal) / 05 06 (empty archive) / 07 08 (spanned)
  if (
    at(0) === 0x50 && at(1) === 0x4b &&
    ((at(2) === 0x03 && at(3) === 0x04) || (at(2) === 0x05 && at(3) === 0x06) || (at(2) === 0x07 && at(3) === 0x08))
  ) {
    return 'zip';
  }
  return null;
}

export type AssetValidation =
  | { ok: true; purpose: AssetPurpose; mime: string; maxBytes: number }
  | { ok: false; message: string };

/**
 * The route's whole MIME/size/magic-byte decision table as one pure function
 * (factored out so tests need no network, no FormData, no route harness).
 * `head` is the file's first bytes (≥ ASSET_SNIFF_HEAD_BYTES when available);
 * when the declared MIME is sniffable, a missing or mismatching header is a
 * refusal — content must PROVE what it claims to be.
 */
export function validateCourseAsset(meta: {
  purpose: string;
  mime: string;
  size: number;
  head?: Uint8Array;
}): AssetValidation {
  const purpose = meta.purpose === 'image' || meta.purpose === 'resource' ? meta.purpose : null;
  if (!purpose) return { ok: false, message: 'invalid_purpose' };

  const mime = normalizeMime(meta.mime);
  if (!ASSET_ALLOWED_MIME[purpose].includes(mime)) return { ok: false, message: 'unsupported_type' };

  if (!Number.isFinite(meta.size) || meta.size <= 0) return { ok: false, message: 'empty_file' };
  const maxBytes = ASSET_MAX_BYTES[purpose];
  if (meta.size > maxBytes) return { ok: false, message: 'too_large' };

  const required = SNIFF_REQUIRED[mime];
  if (required) {
    const sniffed = meta.head ? sniffAssetHead(meta.head) : null;
    if (sniffed !== required) return { ok: false, message: 'content_mismatch' };
  }

  return { ok: true, purpose, mime, maxBytes };
}

/** Longest kept base name (before the forced extension) inside a stored path. */
const MAX_BASE_LENGTH = 48;

/**
 * Sanitizes a client file name into `<safe-base>.<mime-derived-ext>`
 * (rules 1 + 2 in the file header). Never returns an empty or traversal-
 * capable segment: worst case is `fichye.<ext>`.
 */
export function sanitizeAssetFileName(fileName: string, mime: string): string {
  const ext = MIME_EXTENSION[normalizeMime(mime)] || 'bin';

  let name = String(fileName || '');
  // Percent-decode first so encoded separators ('..%2F') become literal ones
  // and get stripped below instead of surviving as opaque text.
  try {
    name = decodeURIComponent(name);
  } catch {
    /* malformed escapes — keep the raw string, the whitelist handles it */
  }

  // Keep only the last path segment: 'a/b/c.pdf' → 'c.pdf', '../../x' → 'x'.
  const segments = name.split(/[/\\]+/).filter(Boolean);
  let base = segments.length > 0 ? segments[segments.length - 1] : '';

  base = base.toLowerCase();
  // No leading dots FIRST ('.htaccess' → 'htaccess', not an all-extension
  // name that would vanish below), then drop the CLIENT extension — the
  // served extension is derived from the validated MIME only (never trust
  // 'photo.exe' / 'note.html').
  base = base.replace(/^\.+/, '');
  base = base.replace(/\.[a-z0-9]{1,8}$/, '');
  // Whitelist [a-z0-9-_.]: every other run (spaces, accents, '%', emoji…)
  // becomes a single '-'.
  base = base.replace(/[^a-z0-9\-_.]+/g, '-');
  // Collapse repeats so '..' / '--' / '__' can never re-form a traversal.
  base = base.replace(/\.{2,}/g, '.').replace(/-{2,}/g, '-').replace(/_{2,}/g, '_');
  // No leading dots (hidden files) or dangling separators.
  base = base.replace(/^[-_.]+/, '').replace(/[-_.]+$/, '');
  base = base.slice(0, MAX_BASE_LENGTH).replace(/[-_.]+$/, '');

  return `${base || 'fichye'}.${ext}`;
}

/** Slug segment of a stored path: [a-z0-9-] only, never empty. */
function sanitizeSlugSegment(slug: string): string {
  const safe = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return safe || 'kou';
}

/**
 * Builds the full Bunny Storage object path:
 * `courses/<slug>/<purpose>/<stamp>-<safe-file-name>`. The stamp
 * (base36 timestamp + 4 random chars) makes two uploads of the same file
 * name distinct — an upload must never silently overwrite an earlier asset
 * still referenced by a published course. `now` is injectable for tests.
 */
export function buildCourseAssetPath(input: {
  slug: string;
  purpose: AssetPurpose;
  fileName: string;
  mime: string;
  now?: number;
}): string {
  const stamp = `${(input.now ?? Date.now()).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const safe = sanitizeAssetFileName(input.fileName, input.mime);
  return `courses/${sanitizeSlugSegment(input.slug)}/${input.purpose}/${stamp}-${safe}`;
}
