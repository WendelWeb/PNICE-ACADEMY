/**
 * Unit tests for `computeCourseReadiness`/`countMissingReadiness` (Task K2 —
 * plan de cours complet). Pure function, no DB touched — builds minimal
 * `ReadinessCourse` fixtures rather than a full `AdminCourse`.
 */
import { describe, it, expect } from 'vitest';
import { computeCourseReadiness, countMissingReadiness, type ReadinessCourse } from './readiness';

function lesson(overrides: Partial<ReadinessCourse['lessons'][number]> = {}): ReadinessCourse['lessons'][number] {
  return {
    id: 'l1',
    title_ht: 'Tit',
    title_fr: 'Titre',
    desc_ht: '',
    desc_fr: '',
    bunnyVideoId: 'vid123',
    durationSeconds: 60,
    isPreview: false,
    sortOrder: 1,
    chapterId: null,
    notes_ht: '',
    notes_fr: '',
    resources: [],
    ...overrides,
  };
}

function chapter(overrides: Partial<ReadinessCourse['chapters'][number]> = {}): ReadinessCourse['chapters'][number] {
  return {
    id: 'c1',
    title_ht: 'Chapit 1',
    title_fr: 'Chapitre 1',
    summary_ht: '',
    summary_fr: '',
    sortOrder: 1,
    ...overrides,
  };
}

function baseCourse(overrides: Partial<ReadinessCourse> = {}): ReadinessCourse {
  return {
    lessons: [lesson({ isPreview: true })],
    chapters: [],
    priceCents: 2500,
    promise_ht: 'Pwomès la',
    promise_fr: 'La promesse',
    mainImage: 'https://example.com/a.jpg',
    ...overrides,
  };
}

describe('computeCourseReadiness — a fully-complete flat course (Task K2)', () => {
  it('reports every item ok, including allChaptersTitled (vacuous, zero chapters)', () => {
    const items = computeCourseReadiness(baseCourse());
    expect(items.every((i) => i.ok)).toBe(true);
    expect(countMissingReadiness(items)).toBe(0);
  });
});

describe('computeCourseReadiness — an empty course (no lessons at all)', () => {
  it('flags hasLesson, allLessonsHaveVideo, allLessonsTitled, and hasPreviewLesson — never vacuously true', () => {
    const items = computeCourseReadiness(baseCourse({ lessons: [] }));
    const byKey = Object.fromEntries(items.map((i) => [i.key, i.ok]));
    expect(byKey.hasLesson).toBe(false);
    expect(byKey.allLessonsHaveVideo).toBe(false);
    expect(byKey.allLessonsTitled).toBe(false);
    expect(byKey.hasPreviewLesson).toBe(false);
    // Zero chapters is still the normal, backward-compatible flat shape.
    expect(byKey.allChaptersTitled).toBe(true);
  });
});

describe('computeCourseReadiness — video/title gaps', () => {
  it('flags allLessonsHaveVideo when any lesson has no bunnyVideoId', () => {
    const items = computeCourseReadiness(
      baseCourse({ lessons: [lesson({ isPreview: true }), lesson({ id: 'l2', bunnyVideoId: '' })] }),
    );
    expect(items.find((i) => i.key === 'allLessonsHaveVideo')?.ok).toBe(false);
  });

  it('flags allLessonsTitled when any lesson is missing either language', () => {
    const missingHt = computeCourseReadiness(baseCourse({ lessons: [lesson({ title_ht: '  ' })] }));
    expect(missingHt.find((i) => i.key === 'allLessonsTitled')?.ok).toBe(false);

    const missingFr = computeCourseReadiness(baseCourse({ lessons: [lesson({ title_fr: '' })] }));
    expect(missingFr.find((i) => i.key === 'allLessonsTitled')?.ok).toBe(false);
  });
});

describe('computeCourseReadiness — chapters', () => {
  it('flags allChaptersTitled when any chapter is missing either language', () => {
    const items = computeCourseReadiness(
      baseCourse({ chapters: [chapter(), chapter({ id: 'c2', title_fr: '' })] }),
    );
    expect(items.find((i) => i.key === 'allChaptersTitled')?.ok).toBe(false);
  });

  it('passes when every chapter has both titles', () => {
    const items = computeCourseReadiness(baseCourse({ chapters: [chapter(), chapter({ id: 'c2' })] }));
    expect(items.find((i) => i.key === 'allChaptersTitled')?.ok).toBe(true);
  });
});

describe('computeCourseReadiness — price / promise / preview / image', () => {
  it('accepts priceCents 0 (explicit FREE mode — owner rule) and >= $1, refuses the 1-99¢ accident band', () => {
    // 0 = the studio's deliberate « Gratis » toggle: a legitimate, READY state.
    expect(computeCourseReadiness(baseCourse({ priceCents: 0 })).find((i) => i.key === 'pricePositive')?.ok).toBe(true);
    // 1-99 cents can only be a mistake — never ready.
    expect(computeCourseReadiness(baseCourse({ priceCents: 50 })).find((i) => i.key === 'pricePositive')?.ok).toBe(false);
    expect(computeCourseReadiness(baseCourse({ priceCents: 100 })).find((i) => i.key === 'pricePositive')?.ok).toBe(true);
  });

  it('flags promiseFilled when either language is blank', () => {
    expect(computeCourseReadiness(baseCourse({ promise_ht: '' })).find((i) => i.key === 'promiseFilled')?.ok).toBe(
      false,
    );
    expect(computeCourseReadiness(baseCourse({ promise_fr: '   ' })).find((i) => i.key === 'promiseFilled')?.ok).toBe(
      false,
    );
  });

  it('flags hasPreviewLesson when no lesson is marked preview', () => {
    const items = computeCourseReadiness(baseCourse({ lessons: [lesson({ isPreview: false })] }));
    expect(items.find((i) => i.key === 'hasPreviewLesson')?.ok).toBe(false);
  });

  it('flags mainImageSet when mainImage is null', () => {
    const items = computeCourseReadiness(baseCourse({ mainImage: null }));
    expect(items.find((i) => i.key === 'mainImageSet')?.ok).toBe(false);
  });
});

describe('countMissingReadiness', () => {
  it('counts the number of ✗ items', () => {
    // priceCents 50 (not 0 — 0 is now the legitimate FREE mode): the 1-99¢
    // accident band still counts as missing.
    const items = computeCourseReadiness(baseCourse({ lessons: [], priceCents: 50 }));
    // hasLesson, allLessonsHaveVideo, allLessonsTitled, pricePositive, hasPreviewLesson = 5
    expect(countMissingReadiness(items)).toBe(5);
  });

  it('is 0 for a fully-complete course', () => {
    expect(countMissingReadiness(computeCourseReadiness(baseCourse()))).toBe(0);
  });
});
