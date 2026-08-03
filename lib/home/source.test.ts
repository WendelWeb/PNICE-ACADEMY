/**
 * Behaviour tests for the homepage's data reads (Stage: the living
 * manifest). No DATABASE_URL in the test env, so the async reads exercise
 * their gated fallback paths — the same honesty contract the page relies
 * on: static-derived numbers where those are true, `null` (hidden) where a
 * claim would need a live DB, and never a throw.
 */
import { describe, it, expect } from 'vitest';
import {
  getHomeStats,
  getHomeTeachers,
  getCourseTeacherChips,
  pickPlanExample,
  minCoursePriceUsd,
} from './source';
import { courses } from '@/data/courses';
import { teachers } from '@/data/teachers';

describe('getHomeStats — no DB ⇒ static truths, null for unclaimable numbers', () => {
  it('derives courses/teachers from the seeded content and hides student/certificate counts', async () => {
    const stats = await getHomeStats();
    expect(stats.courseCount).toBe(courses.length);
    expect(stats.teacherCount).toBe(teachers.length);
    expect(stats.studentCount).toBeNull();
    expect(stats.certificateCount).toBeNull();
  });
});

describe('getHomeTeachers — no DB ⇒ exactly the static registry, via getPublicTeacher', () => {
  it('resolves teacher #1 with the same fields /prof/[slug] renders', async () => {
    const rail = await getHomeTeachers('ht');
    expect(rail).toHaveLength(1);
    expect(rail[0].slug).toBe(teachers[0].slug);
    expect(rail[0].displayName).toBe(teachers[0].displayName);
    expect(rail[0].hasPlan).toBe(true); // teacher #1's documented fallback
  });
});

describe('getCourseTeacherChips — no DB ⇒ the static mapping', () => {
  it('attributes every static course to teacher #1', async () => {
    const slugs = courses.slice(0, 3).map((c) => c.slug);
    const chips = await getCourseTeacherChips(slugs);
    for (const slug of slugs) {
      expect(chips[slug]).toEqual({ name: teachers[0].displayName, slug: teachers[0].slug });
    }
  });

  it('returns an empty map for unknown slugs', async () => {
    expect(await getCourseTeacherChips(['pa-egziste'])).toEqual({});
  });
});

describe('pickPlanExample — a real pass price or nothing', () => {
  it('uses the first teacher with a pass, at their real plan price', () => {
    const example = pickPlanExample([
      { displayName: 'San Pass', slug: 'san-pass', hasPlan: false, plan: null },
      {
        displayName: 'Naïka',
        slug: 'naika',
        hasPlan: true,
        plan: { id: 'p1', priceCentsMonthly: 4900 },
      },
    ]);
    expect(example).toEqual({ name: 'Naïka', slug: 'naika', priceCentsMonthly: 4900 });
  });

  it('falls back to the platform constant only for the documented hasPlan-without-row case', () => {
    const example = pickPlanExample([
      { displayName: 'PNICE Academy', slug: 'pnice-academy', hasPlan: true, plan: null },
    ]);
    expect(example?.priceCentsMonthly).toBe(7900);
  });

  it('returns null when nobody sells a pass — the card shows no example', () => {
    expect(pickPlanExample([{ displayName: 'X', slug: 'x', hasPlan: false, plan: null }])).toBeNull();
  });
});

describe('minCoursePriceUsd — the honest « Depi $X »', () => {
  it('finds the lowest positive price', () => {
    expect(minCoursePriceUsd([{ priceUsd: 39 }, { priceUsd: 19 }, { priceUsd: 59 }])).toBe(19);
  });

  it('ignores non-positive junk and returns null for an empty catalogue', () => {
    expect(minCoursePriceUsd([{ priceUsd: 0 }, { priceUsd: NaN }])).toBeNull();
    expect(minCoursePriceUsd([])).toBeNull();
  });
});
