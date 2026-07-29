/**
 * Unit tests for lib/courses/source.ts — the DB-row→Course mapping, and the
 * gated fallback to data/courses.ts (Task C2-T1). No live DB is touched:
 * `mapDbCourseToCourse` is a pure function, and the fallback path is what
 * runs by default in this test environment (no DATABASE_URL is set here —
 * vitest.config.ts doesn't load .env.local, unlike drizzle.config.ts).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { courses as staticCourses } from '@/data/courses';
import { courseDetails as staticCourseDetails } from '@/data/courseDetails';
import {
  mapDbCourseToCourse,
  mapDbCourseToDetail,
  getAllCourses,
  getCourseBySlug,
  getPublishedCourses,
  getPublishedCourseBySlug,
  getCourseLessons,
  getCourseDetail,
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
    levelHt: null,
    levelFr: null,
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
    resources: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const fakeLessonRows = [
    {
      id: 'l-2',
      courseSlug: 'test-course',
      chapterId: null,
      index: 2,
      titleHt: 'Leson 2 kreyòl',
      titleFr: 'Leçon 2 français',
      descHt: null,
      descFr: null,
      notesHt: null,
      notesFr: null,
      resources: null,
      bunnyVideoId: null,
      durationSeconds: null,
      isPreview: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'l-1',
      courseSlug: 'test-course',
      chapterId: null,
      index: 1,
      titleHt: 'Leson 1 kreyòl',
      titleFr: 'Leçon 1 français',
      descHt: null,
      descFr: null,
      notesHt: null,
      notesFr: null,
      resources: null,
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
      chapterId: null,
      index: 1,
      titleHt: 'Lòt leson',
      titleFr: 'Autre leçon',
      descHt: null,
      descFr: null,
      notesHt: null,
      notesFr: null,
      resources: null,
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

describe('mapDbCourseToDetail — DB row → CourseDetail shape', () => {
  const fakeCourseRow = {
    id: 'c-1',
    ownerUserId: 'owner-1',
    slug: 'test-course',
    code: 'PA-01', // matches a real static entry — round-trip should be identical
    icon: 'rocket',
    category: 'dijital' as const,
    titleHt: 'Tit',
    titleFr: 'Titre',
    taglineHt: 'Tagline ht',
    taglineFr: 'Tagline fr',
    audienceHt: 'Odyans',
    audienceFr: 'Audience',
    learnHt: ['A'],
    learnFr: ['B'],
    levelHt: 'Nivo DB',
    levelFr: 'Niveau DB',
    promiseHt: 'Pwomès DB',
    promiseFr: 'Promesse DB',
    problemHt: 'Pwoblèm DB',
    problemFr: 'Problème DB',
    deliverablesHt: ['Livrezon 1'],
    deliverablesFr: ['Livrable 1'],
    prereqHt: ['Kondisyon 1'],
    prereqFr: ['Condition 1'],
    faqHt: [{ q: 'Kesyon ht', a: 'Repons ht' }],
    faqFr: [{ q: 'Question fr', a: 'Réponse fr' }],
    priceCents: 900,
    currency: 'USD',
    images: null,
    status: 'published' as const,
    reviewNote: null,
    submittedAt: null,
    reviewedBy: null,
    publishedAt: null,
    hasUnpublishedChanges: false,
    resources: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const fakeLessonRows = [
    {
      id: 'l-1',
      courseSlug: 'test-course',
      chapterId: null,
      index: 1,
      titleHt: 'Leson 1',
      titleFr: 'Leçon 1',
      descHt: 'Deskripsyon DB 1',
      descFr: 'Description DB 1',
      notesHt: null,
      notesFr: null,
      resources: null,
      bunnyVideoId: null,
      durationSeconds: 600,
      isPreview: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'l-2',
      courseSlug: 'test-course',
      chapterId: null,
      index: 2,
      titleHt: 'Leson 2',
      titleFr: 'Leçon 2',
      descHt: null, // no desc on the DB row — falls back to the static entry
      descFr: null,
      notesHt: null,
      notesFr: null,
      resources: null,
      bunnyVideoId: null,
      durationSeconds: null, // no duration on the DB row — falls back to static minutes
      isPreview: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];

  it('prefers DB columns for promise/problem/deliverables/prereq/faq', () => {
    const detail = mapDbCourseToDetail(fakeCourseRow, fakeLessonRows);
    expect(detail.promise_ht).toBe('Pwomès DB');
    expect(detail.promise_fr).toBe('Promesse DB');
    expect(detail.problem_ht).toBe('Pwoblèm DB');
    expect(detail.deliverables_ht).toEqual(['Livrezon 1']);
    expect(detail.requirements_fr).toEqual(['Condition 1']);
    expect(detail.faq).toEqual([
      { q_ht: 'Kesyon ht', a_ht: 'Repons ht', q_fr: 'Question fr', a_fr: 'Réponse fr' },
    ]);
  });

  it('prefers DB columns for level_ht/fr and lesson descriptions when set (Task C2-T4)', () => {
    const detail = mapDbCourseToDetail(fakeCourseRow, fakeLessonRows);
    expect(detail.level_ht).toBe('Nivo DB');
    expect(detail.level_fr).toBe('Niveau DB');
    expect(detail.lessonDetails[0].desc_ht).toBe('Deskripsyon DB 1');
    expect(detail.lessonDetails[0].desc_fr).toBe('Description DB 1');
  });

  it('falls back to the static entry (by code) for level_ht/fr and lesson descriptions when the DB column is null', () => {
    const nullLevelRow = { ...fakeCourseRow, levelHt: null, levelFr: null };
    const lessonsWithNullDesc = fakeLessonRows.map((l) => ({ ...l, descHt: null, descFr: null }));
    const detail = mapDbCourseToDetail(nullLevelRow, lessonsWithNullDesc);
    const staticDetail = staticCourseDetails['PA-01'];
    expect(detail.level_ht).toBe(staticDetail.level_ht);
    expect(detail.level_fr).toBe(staticDetail.level_fr);
    expect(detail.lessonDetails[0].desc_ht).toBe(staticDetail.lessonDetails[0].desc_ht);
    expect(detail.lessonDetails[1].desc_fr).toBe(staticDetail.lessonDetails[1].desc_fr);
  });

  it('derives lesson minutes from duration_seconds when present, else the static minutes', () => {
    const detail = mapDbCourseToDetail(fakeCourseRow, fakeLessonRows);
    expect(detail.lessonDetails[0].minutes).toBe(10); // 600s / 60
    expect(detail.lessonDetails[1].minutes).toBe(staticCourseDetails['PA-01'].lessonDetails[1].minutes);
  });

  it('degrades to safe empty defaults when there is no matching static entry (brand-new course, no code)', () => {
    const detail = mapDbCourseToDetail(
      { ...fakeCourseRow, code: null, levelHt: null, levelFr: null, promiseHt: null, faqHt: null, faqFr: null },
      [],
    );
    expect(detail.level_ht).toBe('');
    expect(detail.promise_ht).toBe('');
    expect(detail.faq).toEqual([]);
    expect(detail.lessonDetails).toEqual([]);
  });

  /**
   * Task K1 (plan de cours complet) — curriculum grouping. A course with zero
   * `course_chapters` rows (the default: no 3rd arg passed, exactly what
   * every one of the 9 seeded courses looks like today) must report
   * `chapters: []` and every lesson folded into `ungroupedLessons`, in order
   * — this is the "renders exactly as today" backward-compat guarantee for
   * every current course.
   */
  it('Task K1: zero chapters → chapters: [] and every lesson lands in ungroupedLessons, in order', () => {
    const detail = mapDbCourseToDetail(fakeCourseRow, fakeLessonRows);
    expect(detail.chapters).toEqual([]);
    expect(detail.ungroupedLessons).toHaveLength(2);
    expect(detail.ungroupedLessons?.[0]).toMatchObject({
      id: 'l-1',
      index: 1,
      title_ht: 'Leson 1',
      isPreview: true,
      notes_ht: '',
      notes_fr: '',
      resources: [],
    });
    expect(detail.ungroupedLessons?.[1].id).toBe('l-2');
  });

  it('Task K1: groups a lesson into its chapter, leaving the rest in ungroupedLessons', () => {
    const chapterRows = [
      {
        id: 'ch-1',
        courseSlug: 'test-course',
        index: 1,
        titleHt: 'Chapit 1',
        titleFr: 'Chapitre 1',
        summaryHt: null,
        summaryFr: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];
    const lessonsWithChapter = [{ ...fakeLessonRows[0], chapterId: 'ch-1' }, fakeLessonRows[1]];
    const detail = mapDbCourseToDetail(fakeCourseRow, lessonsWithChapter, chapterRows);
    expect(detail.chapters).toHaveLength(1);
    expect(detail.chapters?.[0].id).toBe('ch-1');
    expect(detail.chapters?.[0].lessons.map((l) => l.id)).toEqual(['l-1']);
    expect(detail.ungroupedLessons?.map((l) => l.id)).toEqual(['l-2']);
  });

  it('Task K1: carries notes_ht/fr and resources through from the DB row', () => {
    const lessonsWithNotes = [
      {
        ...fakeLessonRows[0],
        notesHt: 'Nòt anplis',
        notesFr: 'Note en plus',
        resources: [{ label_ht: 'Lyen', label_fr: 'Lien', url: 'https://example.com', kind: 'link' as const }],
      },
      fakeLessonRows[1],
    ];
    const detail = mapDbCourseToDetail(fakeCourseRow, lessonsWithNotes);
    expect(detail.ungroupedLessons?.[0].notes_ht).toBe('Nòt anplis');
    expect(detail.ungroupedLessons?.[0].notes_fr).toBe('Note en plus');
    expect(detail.ungroupedLessons?.[0].resources).toEqual([
      { label_ht: 'Lyen', label_fr: 'Lien', url: 'https://example.com', kind: 'link' },
    ]);
  });

  it('Task K3: carries course-level resources through from the DB row, defaulting to [] when null', () => {
    expect(mapDbCourseToDetail(fakeCourseRow, fakeLessonRows).resources).toEqual([]);

    const rowWithResources = {
      ...fakeCourseRow,
      resources: [{ label_ht: 'Sit la', label_fr: 'Le site', url: 'https://pnice.academy', kind: 'link' as const }],
    };
    expect(mapDbCourseToDetail(rowWithResources, fakeLessonRows).resources).toEqual([
      { label_ht: 'Sit la', label_fr: 'Le site', url: 'https://pnice.academy', kind: 'link' },
    ]);
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

  it('getPublishedCourseBySlug returns every static course (all count as published in the fallback)', async () => {
    delete process.env.DATABASE_URL;
    const found = await getPublishedCourseBySlug('biznis-shipping');
    expect(found?.code).toBe('PA-03');
    expect(await getPublishedCourseBySlug('nope-not-a-course')).toBeUndefined();
  });

  it('getCourseDetail resolves by slug (not code) and matches data/courseDetails.ts by the course code', async () => {
    delete process.env.DATABASE_URL;
    const detail = await getCourseDetail('biznis-shipping'); // PA-03
    expect(detail).toEqual(staticCourseDetails['PA-03']);
    expect(await getCourseDetail('nope-not-a-course')).toBeUndefined();
  });
});
