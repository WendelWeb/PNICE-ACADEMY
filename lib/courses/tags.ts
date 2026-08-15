/**
 * lib/courses/tags.ts — the ONE definition of what a course tag is.
 *
 * Tags are the granularity BELOW the 4 fixed catalogue categories (owner,
 * août 2026 : « quand un prof crée un cours il peut ajouter tags, catégories
 * etc ») : free words the teacher chooses (« shein », « ladwàn »,
 * « moncash »...), shown on the sales page and searchable in the catalogue.
 *
 * Pure module on purpose — imported by the studio editor (client), the write
 * path (server) and the tests, so it must never touch the DB or `node:` APIs.
 */

/** Hard cap — more than this reads as keyword-stuffing, not description. */
export const MAX_COURSE_TAGS = 8;

/** Per-tag length cap (display: chips on cards/sales page must stay chips). */
export const MAX_TAG_LENGTH = 24;

/**
 * Normalises whatever the form (or a hostile client) sends into the canonical
 * stored shape: trimmed, lowercased, inner whitespace collapsed, deduped,
 * capped in count and length, never anything but plain strings. Lowercase is
 * deliberate — « Shein » and « shein » must be ONE tag for search and for
 * any future tag-facet counts.
 */
export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH).trim();
    if (!tag) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= MAX_COURSE_TAGS) break;
  }
  return out;
}
