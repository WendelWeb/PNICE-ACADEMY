/**
 * Unit tests for lib/teacher/admin.ts's pure `slugifyTeacherName` (Task:
 * DB-backed teacher slugs) — mirrors lib/courses/write.ts's private
 * `slugify` rules exactly (lowercase, strip diacritics, collapse
 * non-ASCII-alnum runs to a single hyphen, trim edge hyphens, cap length).
 * The dedupe half (`generateUniqueTeacherSlug`) needs a live DB to exercise
 * meaningfully and is covered indirectly by `approveTeacherProfile`'s
 * `db_required` gate — this test env has no DATABASE_URL (see
 * lib/teacher/profile.test.ts's header for the same reasoning).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { slugifyTeacherName, countTeacherProfilesByStatus } from './admin';

describe('slugifyTeacherName — pure kebab-case ASCII slug', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifyTeacherName('Jean Pierre')).toBe('jean-pierre');
  });

  it('strips accents/diacritics', () => {
    expect(slugifyTeacherName('Pwofesè Léa')).toBe('pwofese-lea');
  });

  it('collapses punctuation runs into a single hyphen', () => {
    expect(slugifyTeacherName("Jean-Pierre O'Brien!!")).toBe('jean-pierre-o-brien');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugifyTeacherName('  --Ochre--  ')).toBe('ochre');
  });

  it('returns an empty string for input with no ASCII-slugifiable characters', () => {
    expect(slugifyTeacherName('')).toBe('');
    expect(slugifyTeacherName('   ')).toBe('');
  });

  it('caps length at 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugifyTeacherName(long)).toHaveLength(60);
  });
});

describe('countTeacherProfilesByStatus — gated count (Stage 7 sidebar badge)', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('falls back to an all-zero record with no DATABASE_URL, never throws', async () => {
    delete process.env.DATABASE_URL;
    expect(await countTeacherProfilesByStatus()).toEqual({
      pending: 0,
      approved: 0,
      suspended: 0,
      rejected: 0,
    });
  });
});
