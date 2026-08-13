import { describe, it, expect } from 'vitest';
import { courses, getCourse, isPreviewLesson, COURSE_CATEGORIES } from './courses';

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

  it('has a valid, declared category for every course', () => {
    for (const c of courses) {
      expect(COURSE_CATEGORIES).toContain(c.category);
    }
  });

  it('uses every declared category at least once', () => {
    const used = new Set(courses.map((c) => c.category));
    for (const cat of COURSE_CATEGORIES) {
      expect(used.has(cat)).toBe(true);
    }
  });

  describe('isPreviewLesson — the TEACHER decides, not the position', () => {
    // The regression this pins: the gate used to return `n === 1`, so lesson 1
    // of every course on the marketplace was free whatever the teacher chose,
    // while the sales page showed the lesson they actually ticked.
    const lessons = [
      { title_ht: 'a', title_fr: 'a', isPreview: false },
      { title_ht: 'b', title_fr: 'b', isPreview: true },
      { title_ht: 'c', title_fr: 'c' },
    ];

    it('unlocks exactly the lesson the teacher flagged', () => {
      expect(isPreviewLesson(lessons, 2)).toBe(true);
    });

    it('does NOT unlock lesson 1 just for being lesson 1', () => {
      expect(isPreviewLesson(lessons, 1)).toBe(false);
    });

    it('treats a missing flag as locked, never as free', () => {
      expect(isPreviewLesson(lessons, 3)).toBe(false);
    });

    it('locks anything out of range instead of throwing', () => {
      expect(isPreviewLesson(lessons, 0)).toBe(false);
      expect(isPreviewLesson(lessons, 99)).toBe(false);
      expect(isPreviewLesson([], 1)).toBe(false);
    });

    it('can unlock more than one lesson — a teacher may offer several', () => {
      const generous = [
        { title_ht: 'a', title_fr: 'a', isPreview: true },
        { title_ht: 'b', title_fr: 'b', isPreview: true },
      ];
      expect(isPreviewLesson(generous, 1)).toBe(true);
      expect(isPreviewLesson(generous, 2)).toBe(true);
    });
  });
});
