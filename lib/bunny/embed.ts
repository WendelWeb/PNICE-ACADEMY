/**
 * Bunny Stream embed helper (Task L4). Env-gated: with no
 * `BUNNY_STREAM_LIBRARY_ID` set, `bunnyConfigured()` is false and
 * `bunnyEmbedUrl()` always returns `null` — callers (the lesson player) must
 * fall back to the existing placeholder. Never throws, never fetches.
 *
 * SECURITY: reads `process.env` at call time only (matches the pattern in
 * lib/admin/health/bunny.ts) and never logs, returns, or embeds a secret in
 * the URL it builds.
 *
 * Signed/token embed (documented decision): Bunny Stream supports an
 * optional "Token Authentication" mode for a library, where the embed URL
 * carries a `token` (a keyed hash of the video path + expiry) signed with a
 * *separate* per-library secret the owner must explicitly enable in the
 * Bunny dashboard. We do NOT implement that here for launch: without a real
 * library to verify against, shipping an unverified signing scheme risks a
 * silently-wrong token that looks configured but never plays — worse than
 * the plain embed. The standard public embed URL (library id + video id in
 * the path, no secret required) is Bunny's default and is exactly what
 * renders once the owner pastes in `BUNNY_STREAM_LIBRARY_ID` and a lesson's
 * `bunnyVideoId`. If the owner later turns on Token Authentication, this is
 * the one function to extend (add `BUNNY_STREAM_TOKEN_AUTH_KEY` + signing).
 */

/** True once the owner has posted a Bunny Stream library id. */
export function bunnyConfigured(): boolean {
  return Boolean(process.env.BUNNY_STREAM_LIBRARY_ID?.trim());
}

/**
 * Builds the Bunny Stream iframe embed URL for a lesson's video.
 * Returns `null` when Bunny isn't configured, or when `videoId` is missing/
 * blank — the caller renders the placeholder in either case.
 */
export function bunnyEmbedUrl(videoId: string | null | undefined): string | null {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const id = videoId?.trim();
  if (!libraryId || !id) return null;

  const params = new URLSearchParams({
    autoplay: 'false',
    preload: 'true',
    responsive: 'true',
  });

  // Encode both path segments: harmless for today's developer-authored ids, but
  // `bunnyVideoId` becomes CMS/DB-writable at C2 — never let it break the path.
  return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(id)}?${params.toString()}`;
}
