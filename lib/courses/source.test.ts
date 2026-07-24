/**
 * Unit tests for lib/courses/source.ts — the DB-row→Course mapping, and the
 * gated fallback to data/courses.ts (Task C2-T1). No live DB is touched:
 * `mapDbCourseToCourse` is a pure function, and the fallback path is what
 * runs by default in this test environment (no DATABASE_URL is set here —
 * vitest.config.ts doesn't load .env.local, unlike drizzle.config.ts).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { courses as staticCourses } from '@/data/courses';
import {
  mapDbCourseToCourse,
  getAllCourses,
  getCourseBySlug,
  getPublishedCourses,
  getCourseLessons,
} from './source';

describe('mapDbCourseToCourse — DB row → Course shape', () => {
  const fakeCourseRow = {
    id: 'c-1',
    ownerUserId: 'owner-1',
    slug: 'test-course',
    code: 'PA-TEST',
    icon: 'rocket',
    category: 'dijital' as const,
    titleHt: 'Tit an kreyòl',
    titleFr: 'Titre en français',
    taglineHt: 'Tagline kreyòl',
    taglineFr: 'Tagline français',
    audienceHt: 'Odyans kreyòl',
    audienceFr: 'Audience française',
    learnHt: ['Aprann A', 'Aprann B'],
    learnFr: ['Apprendre A', 'Apprendre B'],
    promiseHt: null,
    promiseFr: null,
    problemHt: null,
    problemFr: null,
    deliverablesHt: null,
    deliverablesFr: null,
    prereqHt: null,
    prereqFr: null,
    faqHt: null,
    faqFr: null,
    priceCents: 1900,
    currency: 'USD',
    images: null,
    status: 'published' as const,
    reviewNote: null,
    submittedAt: null,
    reviewedBy: null,
    publishedAt: null,
    hasUnpublishedChanges: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const fakeLessonRows = [
    {
      id: 'l-2',
      courseSlug: 'test-course',
      index: 2,
      titleHt: 'Leson 2 kreyòl',
      titleFr: 'Leçon 2 français',
      bunnyVideoId: null,
      durationSeconds: null,
      isPreview: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'l-1',
      courseSlug: 'test-course',
      index: 1,
      titleHt: 'Leson 1 kreyòl',
      titleFr: 'Leçon 1 français',
      bunnyVideoId: 'bunny-abc123',
      durationSeconds: 300,
      isPreview: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    // A lesson belonging to a DIFFERENT course — must be filtered out.
    {
      id: 'l-3',
      courseSlug: 'other-course',
      index: 1,
      titleHt: 'Lòt leson',
      titleFr: 'Autre leçon',
      bunnyVideoId: null,
      durationSeconds: null,
      isPreview: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];

  it('maps every Course field from the DB row', () => {
    const mapped = mapDbCourseToCourse(fakeCourseRow, fakeLessonRows);

    expect(mapped).toEqual({
      code: 'PA-TEST',
      slug: 'test-course',
      icon: 'rocket',
      category: 'dijital',
      priceUsd: 19,
      title_ht: 'Tit an kreyòl',
      title_fr: 'Titre en français',
      tagline_ht: 'Tagline kreyòl',
      tagline_fr: 'Tagline français',
      learn_ht: ['Aprann A', 'Aprann B'],
      learn_fr: ['Apprendre A', 'Apprendre B'],
      audience_ht: 'Odyans kreyòl',
      audience_fr: 'Audience française',
      lessons: [
        { title_ht: 'Leson 1 kreyòl', title_fr: 'Leçon 1 français', bunnyVideoId: 'bunny-abc123' },
        { title_ht: 'Leson 2 kreyòl', title_fr: 'Leçon 2 français', bunnyVideoId: undefined },
      ],
    });
  });

  it('sorts lessons by index and excludes lessons from other courses', () => {
    const mapped = mapDbCourseToCourse(fakeCourseRow, fakeLessonRows);
    expect(mapped.lessons).toHaveLength(2);
    expect(mapped.lessons[0].title_fr).toBe('Leçon 1 français');
    expect(mapped.lessons[1].title_fr).toBe('Leçon 2 français');
  });

  it('falls back to sane defaults for nullable DB columns', () => {
    const sparseRow = {
      ...fakeCourseRow,
      code: null,
      icon: null,
      category: null,
      titleHt: null,
      titleFr: null,
      taglineHt: null,
      taglineFr: null,
      audienceHt: null,
      audienceFr: null,
      learnHt: null,
      learnFr: null,
      priceCents: null,
    };
    const mapped = mapDbCourseToCourse(sparseRow, []);
    expect(mapped.code).toBe('test-course'); // falls back to slug
    expect(mapped.icon).toBe('book');
    expect(mapped.category).toBe('lavi-pratik');
    expect(mapped.priceUsd).toBe(0);
    expect(mapped.title_ht).toBe('');
    expect(mapped.learn_ht).toEqual([]);
    expect(mapped.lessons).toEqual([]);
  });
});

describe('gated fallback — no DATABASE_URL', () => {
  const ORIGINAL_DB = process.env.DATABASE_URL;

  afterEach(() => {
    if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DB;
  });

  it('getAllCourses returns the 9 static courses untouched', async () => {
    delete process.env.DATABASE_URL;
    const result = await getAllCourses();
    expect(result).toHaveLength(9);
    expect(result).toEqual(staticCourses);
  });

  it('getPublishedCourses returns the 9 static courses untouched', async () => {
    delete process.env.DATABASE_URL;
    const result = await getPublishedCourses();
    expect(result).toHaveLength(9);
    expect(result).toEqual(staticCourses);
  });

  it('getCourseBySlug resolves a known slug and returns undefined for unknown ones', async () => {
    delete process.env.DATABASE_URL;
    const found = await getCourseBySlug('biznis-shipping');
    expect(found?.code).toBe('PA-03');
    expect(await getCourseBySlug('nope-not-a-course')).toBeUndefined();
  });

  it('getCourseLessons returns the lessons folded into the static course', async () => {
    delete process.env.DATABASE_URL;
    const lessons = await getCourseLessons('biznis-shipping');
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0].title_fr.length).toBeGreaterThan(0);
  });

  it('getCourseLessons returns [] for an unknown slug', async () => {
    delete process.env.DATABASE_URL;
    expect(await getCourseLessons('nope-not-a-course')).toEqual([]);
  });
});
