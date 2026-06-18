import { describe, it, expect } from 'vitest';
import { courses, getCourse } from './courses';

describe('courses data', () => {
  it('has exactly 9 formations', () => {
    expect(courses).toHaveLength(9);
  });

  it('has unique slugs and codes', () => {
    const slugs = new Set(courses.map((c) => c.slug));
    const codes = new Set(courses.map((c) => c.code));
    expect(slugs.size).toBe(9);
    expect(codes.size).toBe(9);
  });

  it('has bilingual content and a positive price for every course', () => {
    for (const c of courses) {
      expect(c.title_ht.length).toBeGreaterThan(0);
      expect(c.title_fr.length).toBeGreaterThan(0);
      expect(c.tagline_ht.length).toBeGreaterThan(0);
      expect(c.tagline_fr.length).toBeGreaterThan(0);
      expect(c.learn_ht.length).toBe(c.learn_fr.length);
      expect(c.lessons.length).toBeGreaterThan(0);
      expect(c.priceUsd).toBeGreaterThan(0);
    }
  });

  it('resolves a course by slug and returns undefined for unknown slugs', () => {
    expect(getCourse('biznis-shipping')?.code).toBe('PA-03');
    expect(getCourse('nope')).toBeUndefined();
  });
});
