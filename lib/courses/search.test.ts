import { describe, it, expect } from 'vitest';
import { tokenizeQuery, courseSearchScore, courseMatchesQuery, normalizeSearch } from './search';
import { sanitizeTags, MAX_COURSE_TAGS, MAX_TAG_LENGTH } from './tags';
import type { Course } from '@/data/courses';

const base: Course = {
  code: 'PA-01',
  slug: 'achte-sou-entenet',
  icon: 'shopping-cart',
  category: 'lavi-pratik',
  priceUsd: 2,
  title_ht: 'Achte sou Amazon, Shein, Alibaba',
  title_fr: 'Acheter sur Amazon, Shein, Alibaba',
  tagline_ht: 'Achte nan tout mond lan, san pèdi kòb nan entèmedyè',
  tagline_fr: 'Achetez dans le monde entier, sans perdre d’argent',
  learn_ht: ['Konpare pri sou plizyè platfòm', 'Swiv yon kòmand jiska ladwàn'],
  learn_fr: ['Comparer les prix', 'Suivre une commande jusqu’à la douane'],
  audience_ht: 'Moun ki vle achte san entèmedyè',
  audience_fr: 'Ceux qui veulent acheter sans intermédiaire',
  lessons: [
    { title_ht: 'Kreye kont Amazon', title_fr: 'Créer un compte Amazon' },
    { title_ht: 'Peye ak MonCash', title_fr: 'Payer avec MonCash' },
  ],
  tags: ['shein', 'ladwàn'],
};

describe('normalizeSearch / tokenizeQuery', () => {
  it('strips diacritics and case', () => {
    expect(normalizeSearch('Ladwàn Métôde')).toBe('ladwan metode');
  });
  it('folds typographic apostrophes and ligatures NFD cannot decompose', () => {
    expect(normalizeSearch('d’argent')).toBe("d'argent");
    expect(normalizeSearch('CŒUR sœur')).toBe('coeur soeur');
  });
  it('tokenizes on whitespace, dropping empties', () => {
    expect(tokenizeQuery('  Achte   Shein ')).toEqual(['achte', 'shein']);
  });
  it('splits punctuation off tokens — a pasted comma list must not zero the search', () => {
    expect(tokenizeQuery('Amazon, Shein')).toEqual(['amazon', 'shein']);
    expect(tokenizeQuery('moncash,')).toEqual(['moncash']);
  });
});

describe('courseSearchScore', () => {
  it('finds a course through its tag, diacritic-insensitively', () => {
    expect(courseSearchScore(base, tokenizeQuery('ladwan'))).toBeGreaterThan(0);
  });

  it('AND semantics: every token must match somewhere', () => {
    expect(courseSearchScore(base, tokenizeQuery('achte bitcoin'))).toBe(0);
    expect(courseSearchScore(base, tokenizeQuery('achte shein'))).toBeGreaterThan(0);
  });

  it('ranks a title hit above a lesson-title hit', () => {
    const titleHit = courseSearchScore(base, ['amazon']); // in title
    const lessonHit = courseSearchScore(base, ['moncash']); // only in a lesson title
    expect(titleHit).toBeGreaterThan(lessonHit);
  });

  it('matches the teacher name when provided', () => {
    expect(courseSearchScore(base, ['dadlyn'])).toBe(0);
    expect(courseSearchScore(base, ['dadlyn'], 'Dacéus Dadlyn')).toBeGreaterThan(0);
  });

  it('empty query matches everything but scores nothing', () => {
    expect(courseMatchesQuery(base, [])).toBe(true);
    expect(courseSearchScore(base, [])).toBe(0);
  });

  it('a keyboard apostrophe finds typographic-apostrophe course text', () => {
    // tagline_fr holds « d’argent » (U+2019); the buyer types U+0027.
    expect(courseSearchScore(base, tokenizeQuery("d'argent"))).toBeGreaterThan(0);
  });

  it('prefix bonus applies to the FRENCH title too, not only the Haitian one', () => {
    const htPrefix = courseSearchScore(base, ['achte']);
    const frPrefix = courseSearchScore(base, ['acheter']);
    // Both are title hits AND title prefixes — both must carry the bonus.
    expect(frPrefix).toBe(htPrefix);
  });
});

describe('sanitizeTags', () => {
  it('lowercases, trims, collapses whitespace and dedupes', () => {
    expect(sanitizeTags([' Shein ', 'shein', 'La  Dwan'])).toEqual(['shein', 'la dwan']);
  });
  it('caps count and length, drops non-strings and empties', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(sanitizeTags(many)).toHaveLength(MAX_COURSE_TAGS);
    expect(sanitizeTags(['x'.repeat(99)])[0]).toHaveLength(MAX_TAG_LENGTH);
    expect(sanitizeTags(['', '  ', 42, null, 'ok'] as unknown[])).toEqual(['ok']);
  });
  it('non-array input yields []', () => {
    expect(sanitizeTags('shein')).toEqual([]);
    expect(sanitizeTags(undefined)).toEqual([]);
  });
});
