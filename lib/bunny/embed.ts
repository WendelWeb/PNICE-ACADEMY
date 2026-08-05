/**
 * Bunny Stream embed helper (Task L4). Env-gated: with no
 * `BUNNY_STREAM_LIBRARY_ID` set, `bunnyConfigured()` is false and
 * `bunnyEmbedUrl()` always returns `null` — callers (the lesson player) must
 * fall back to the existing placeholder. Never throws, never fetches.
 *
 * SECURITY: reads `process.env` at call time only (matches the pattern in
 * lib/admin/health/bunny.ts) and never logs or returns the signing key
 * itself — only the resulting hash goes into the URL it builds.
 *
 * Signed/token embed (Stage 8 — was deferred, now implemented): Bunny Stream
 * supports an optional "Token Authentication" mode for a library, where the
 * embed URL must carry a `token` (`sha256_hex(security_key + video_id +
 * expires)`, Bunny's documented scheme — see
 * https://docs.bunny.net/docs/stream-embed-token-authentication) plus the
 * `expires` unix timestamp it was signed for. This is OFF by default (exactly
 * today's plain, unsigned embed) — it activates ONLY once the owner sets
 * `BUNNY_EMBED_TOKEN_KEY` (the per-library "Token authentication key" from
 * the Bunny dashboard) AND has actually turned Token Authentication ON for
 * the library there (see docs/launch-checklist.md, Étape 5). Setting the env
 * var without enabling it in the dashboard would make every embed 403;
 * enabling it in the dashboard without the env var would leave every embed
 * unsigned and public — the checklist calls out doing both together.
 */
import { createHash } from 'node:crypto';

/** True once the owner has posted a Bunny Stream library id. */
export function bunnyConfigured(): boolean {
  return Boolean(process.env.BUNNY_STREAM_LIBRARY_ID?.trim());
}

/** True once the owner has posted a Bunny Stream Token Authentication key. */
export function bunnyTokenAuthConfigured(): boolean {
  return Boolean(process.env.BUNNY_EMBED_TOKEN_KEY?.trim());
}

// How long a signed embed URL stays valid. Generous enough that a learner
// mid-lesson never hits an expired link on a slow connection, short enough
// that a URL copied out of the page source (the exact leak this closes) goes
// stale well before it could be meaningfully reshared.
const TOKEN_TTL_SECONDS = 6 * 60 * 60; // 6 hours

/** `sha256_hex(key + videoId + expires)` — Bunny's documented token scheme. */
function signEmbedToken(key: string, videoId: string, expires: number): string {
  return createHash('sha256').update(`${key}${videoId}${expires}`).digest('hex');
}

/**
 * Builds the Bunny Stream iframe embed URL for a lesson's video.
 * Returns `null` when Bunny isn't configured, or when `videoId` is missing/
 * blank — the caller renders the placeholder in either case.
 *
 * When `BUNNY_EMBED_TOKEN_KEY` is set, the URL additionally carries a signed
 * `token` + `expires` pair (see file header) — this is what turns an
 * indefinitely-shareable public link into one that goes stale in a few
 * hours. Unset (the default today), the URL is byte-identical to before.
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

  const tokenKey = process.env.BUNNY_EMBED_TOKEN_KEY?.trim();
  if (tokenKey) {
    const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    params.set('token', signEmbedToken(tokenKey, id, expires));
    params.set('expires', String(expires));
  }

  // Encode both path segments: harmless for today's developer-authored ids, but
  // `bunnyVideoId` becomes CMS/DB-writable at C2 — never let it break the path.
  return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(id)}?${params.toString()}`;
}
