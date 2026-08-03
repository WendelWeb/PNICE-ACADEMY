/**
 * lib/uploads/image-prep.ts — PURE helpers for the CLIENT-side photo prep
 * that happens before a course image is uploaded (Stage 3 — course photos):
 * ImagesManager draws the picked photo onto a canvas (longest side capped),
 * re-encodes it as webp (jpeg fallback), and auto-derives a human alt text.
 * Zero DOM, zero I/O — the canvas/File orchestration lives in
 * components/admin/content/ImagesManager.tsx; everything DECIDABLE without a
 * browser is factored here so it's unit-tested without one (mirrors
 * lib/uploads/course-asset.ts's split for the server side).
 *
 * Why client-side resize at all: teachers are on phones — a 12 MP photo is
 * 4000×3000 and 3–6 MB. Resizing before the network (a) keeps uploads fast
 * on Haitian mobile connections, (b) stays under the server's 4 MB image cap
 * (which itself sits under Vercel's ~4.5 MB request-body limit — see
 * lib/uploads/course-asset.ts's ASSET_MAX_BYTES) without ever showing a
 * teacher a size error for a normal phone photo, and (c) removes the need
 * for server-side sharp entirely.
 */

/** Longest output side, px — plenty for the largest render (1120px hero, 2x DPR is capped by quality anyway). */
export const IMAGE_MAX_SIDE = 1600;

/** Encode quality for both webp and the jpeg fallback. */
export const IMAGE_ENCODE_QUALITY = 0.85;

/**
 * Client-side sanity cap on the SOURCE file (before decode) — mirrors
 * ProfileTab's MAX_BYTES approach: an immediate plain message instead of the
 * phone freezing on a decode of something absurd. Generous on purpose: the
 * OUTPUT is what must fit the server's 4 MB image cap, and a ≤1600px
 * webp/jpeg is always far under it.
 */
export const IMAGE_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Scales (width, height) to fit `maxSide` on the longest side, never
 * upscaling, preserving aspect ratio, always returning integers ≥ 1.
 * Degenerate input (0/negative/NaN) collapses to 1×1 — the caller treats the
 * decode as failed long before this matters, this just guarantees canvas
 * dimensions are always valid.
 */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number = IMAGE_MAX_SIDE,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Auto-derived alt text for a photo saved without the teacher typing one
 * (the "Tèks alt" input left the primary path in Stage 3): the course title
 * plus the photo's position — real, useful screen-reader text, no jargon
 * asked of the teacher. Falls back to the slug for an untitled course.
 */
export function deriveAutoAlt(courseTitle: string, slug: string, photoNumber: number): string {
  const name = courseTitle.trim() || slug;
  return `${name} — foto ${photoNumber}`;
}

/**
 * File name sent with the re-encoded blob. The server rebuilds the stored
 * path from scratch (buildCourseAssetPath — sanitized base, extension forced
 * from the VALIDATED mime), so this is cosmetic/traceability only — but the
 * extension should still match the re-encoded type, not the original file's.
 */
export function uploadBlobName(originalName: string, mime: string): string {
  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  const base = (originalName || '').replace(/\.[^.]+$/, '').trim() || 'foto';
  return `${base}.${ext}`;
}
