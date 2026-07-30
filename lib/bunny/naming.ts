/**
 * lib/bunny/naming.ts — pure, unit-testable formatting for AUTOMATIC Bunny
 * organization (owner asked: "is it organized like Udemy, is it all
 * automatic?"). No env access, no network, no DB, no side effects: given a
 * course/chapter/lesson's already-resolved fields (see
 * lib/bunny/organize.ts's `planOrganizedUpload`, which does the resolving),
 * this builds the video title Bunny shows in its dashboard, so a teacher's
 * uploads read as a real curriculum —
 * `"PA-03 · Pati 2 · Kijan pou jere lajan · Leson 3 · Negosye ak yon depo"` —
 * instead of whatever the teacher's raw file happened to be named.
 *
 * LOCALE: ht is the platform's default locale (see the brief-corrections
 * memory note — single price, direction B, ht default). Every bilingual
 * field here (`chapterTitle`/`lessonTitle`) resolves ht first, falling back
 * to fr only when ht is blank, matching that default everywhere else in the
 * app resolves content.
 */

export type LocalizedText = { ht: string; fr: string };

/** Bunny doesn't document a hard title cap, but ~200 chars is a generous,
 *  conservative limit that keeps titles readable in any dashboard/list view. */
export const BUNNY_VIDEO_TITLE_MAX_LENGTH = 200;

/** ht-first, fr-fallback resolution for a bilingual field. `''` if both are blank. */
function resolveLocalized(text: LocalizedText | null | undefined): string {
  if (!text) return '';
  return text.ht?.trim() || text.fr?.trim() || '';
}

/** Truncates to `BUNNY_VIDEO_TITLE_MAX_LENGTH`, appending an ellipsis — never
 *  cuts mid-multibyte-char since JS string slicing is UTF-16 code-unit based
 *  and these titles are plain BMP text (Kreyòl/French accented latin). */
function capLength(title: string): string {
  if (title.length <= BUNNY_VIDEO_TITLE_MAX_LENGTH) return title;
  return `${title.slice(0, BUNNY_VIDEO_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

export type BunnyVideoTitleParams = {
  /** e.g. "PA-03". `null`/blank omits the segment entirely. */
  courseCode: string | null;
  /** The lesson's chapter's `sortOrder` (1-based, "Pati N") — `null` when the
   *  lesson has no chapter ("hors chapitre"), which omits the whole "Pati"
   *  segment (courses that predate K1 chapters look exactly as before). */
  chapterIndex: number | null;
  /** Required together with a non-null `chapterIndex`; ignored otherwise. */
  chapterTitle: LocalizedText | null;
  /** The lesson's own `sortOrder` (1-based) — always included. */
  lessonIndex: number;
  lessonTitle: LocalizedText;
};

/**
 * Builds the structured Bunny video title. Pure — safe to unit test without
 * a DB or Bunny credentials (see lib/bunny/naming.test.ts).
 */
export function buildBunnyVideoTitle(params: BunnyVideoTitleParams): string {
  const segments: string[] = [];

  const code = params.courseCode?.trim();
  if (code) segments.push(code);

  if (params.chapterIndex != null) {
    const chapterLabel = resolveLocalized(params.chapterTitle);
    segments.push(chapterLabel ? `Pati ${params.chapterIndex} · ${chapterLabel}` : `Pati ${params.chapterIndex}`);
  }

  const lessonLabel = resolveLocalized(params.lessonTitle) || 'San tit';
  segments.push(`Leson ${params.lessonIndex} · ${lessonLabel}`);

  return capLength(segments.join(' · '));
}
