/**
 * lib/courses/search.ts — the ONE course-search brain, shared by the
 * catalogue toolbar (components/courses/CatalogBrowser.tsx), the global nav
 * search (components/layout/NavSearch.tsx) and the tests.
 *
 * Pure + client-safe on purpose: no DB, no fs — both consumers run in the
 * browser over already-loaded course arrays (a 9–50 course marketplace fits
 * in a few KB; revisit with a server index long before that stops being
 * true).
 *
 * Design (owner: « partie recherche pas vraiment pro ») :
 *  - diacritic/case-insensitive (« ladwan » finds « ladwàn »)
 *  - TOKENIZED with AND semantics: every word the buyer typed must match
 *    somewhere — « achte shein » no longer matches every course containing
 *    « achte »
 *  - FIELD-WEIGHTED relevance: a hit in the title outranks one in a lesson
 *    title, so results are ORDERED by how well they match, not by price
 *  - searches BOTH languages plus tags, teacher name, audience and lesson
 *    titles — fields the old search silently ignored
 */
import type { Course } from '@/data/courses';

/**
 * Diacritic-insensitive, case-insensitive normalisation. Beyond the NFD
 * combining-mark strip (U+0300–U+036F), three folds NFD can't do
 * (adversarial review): the typographic apostrophe U+2019 → ' (teacher copy
 * says « d’argent », keyboards type « d'argent ») and the œ/æ ligatures,
 * which have NO canonical decomposition (« cœur » must match « coeur »).
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

/**
 * Splits a raw query into normalised tokens (empty array = no query).
 * Split on anything that isn't a letter or digit — NOT just whitespace
 * (adversarial review): with strict AND scoring, a pasted « Amazon, Shein »
 * kept the comma glued to « amazon, », matched nothing, and zeroed the
 * whole search.
 */
export function tokenizeQuery(q: string): string[] {
  return normalizeSearch(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Heaviest field wins per token; weights are relative, not magic. */
const FIELD_WEIGHTS = {
  title: 5,
  tags: 4,
  teacher: 3,
  tagline: 2.5,
  learn: 2,
  audience: 1.5,
  lessons: 1,
} as const;

function searchFields(course: Course, teacherName?: string): { text: string; weight: number }[] {
  return [
    { text: normalizeSearch(`${course.title_ht} ${course.title_fr}`), weight: FIELD_WEIGHTS.title },
    { text: normalizeSearch((course.tags ?? []).join(' ')), weight: FIELD_WEIGHTS.tags },
    { text: normalizeSearch(teacherName ?? ''), weight: FIELD_WEIGHTS.teacher },
    { text: normalizeSearch(`${course.tagline_ht} ${course.tagline_fr}`), weight: FIELD_WEIGHTS.tagline },
    { text: normalizeSearch([...course.learn_ht, ...course.learn_fr].join(' ')), weight: FIELD_WEIGHTS.learn },
    { text: normalizeSearch(`${course.audience_ht} ${course.audience_fr}`), weight: FIELD_WEIGHTS.audience },
    {
      text: normalizeSearch(course.lessons.map((l) => `${l.title_ht} ${l.title_fr}`).join(' ')),
      weight: FIELD_WEIGHTS.lessons,
    },
  ];
}

/**
 * Relevance score: 0 = no match. AND semantics — EVERY token must hit at
 * least one field; each token contributes its best field's weight, with a
 * small bonus when the course title STARTS with the token (what typeahead
 * users expect to rank first).
 */
export function courseSearchScore(course: Course, tokens: string[], teacherName?: string): number {
  if (tokens.length === 0) return 0;
  const fields = searchFields(course, teacherName);
  // Prefix bonus checked against EACH title separately (adversarial review:
  // a concatenated ht+fr string gave the bonus only to Haitian-title
  // prefixes — the French title's first word always sat mid-string).
  const titleHtNorm = normalizeSearch(course.title_ht);
  const titleFrNorm = normalizeSearch(course.title_fr);
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const f of fields) {
      if (f.weight > best && f.text.includes(token)) best = f.weight;
    }
    if (best === 0) return 0;
    if (titleHtNorm.startsWith(token) || titleFrNorm.startsWith(token)) best += 1;
    total += best;
  }
  return total;
}

/** Convenience for filter pipelines. */
export function courseMatchesQuery(course: Course, tokens: string[], teacherName?: string): boolean {
  return tokens.length === 0 || courseSearchScore(course, tokens, teacherName) > 0;
}
