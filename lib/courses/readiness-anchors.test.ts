/**
 * Unit tests for `computeReadinessAnchors` (Task D1 — le bordereau's "bon de
 * contrôle" rail). Mirrors `readiness.test.ts`'s fixtures.
 */
import { describe, it, expect } from 'vitest';
import { computeReadinessAnchors } from './readiness-anchors';
import type { ReadinessCourse } from './readiness';

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

describe('computeReadinessAnchors — fixed field anchors', () => {
  it('always points price/promise/main-image at their own field id, regardless of course state', () => {
    const anchors = computeReadinessAnchors(baseCourse());
    expect(anchors.pricePositive).toEqual({ step: 'infos', anchorId: 'field-price' });
    expect(anchors.promiseFilled).toEqual({ step: 'infos', anchorId: 'field-promise' });
    expect(anchors.mainImageSet).toEqual({ step: 'medias', anchorId: 'field-main-image' });
  });
});

describe('computeReadinessAnchors — empty course', () => {
  it('falls back every lesson-related item to the "add lesson" button', () => {
    const anchors = computeReadinessAnchors(baseCourse({ lessons: [] }));
    expect(anchors.hasLesson).toEqual({ step: 'plan', anchorId: 'plan-add-lesson' });
    expect(anchors.allLessonsTitled).toEqual({ step: 'plan', anchorId: 'plan-add-lesson' });
    expect(anchors.allLessonsHaveVideo).toEqual({ step: 'plan', anchorId: 'plan-add-lesson' });
    expect(anchors.hasPreviewLesson).toEqual({ step: 'plan', anchorId: 'plan-add-lesson' });
  });
});

describe('computeReadinessAnchors — per-lesson targeting', () => {
  it('points allLessonsHaveVideo at the FIRST lesson missing a video', () => {
    const anchors = computeReadinessAnchors(
      baseCourse({ lessons: [lesson({ id: 'ok' }), lesson({ id: 'bad', bunnyVideoId: '' })] }),
    );
    expect(anchors.allLessonsHaveVideo).toEqual({ step: 'plan', anchorId: 'lesson-bad' });
  });

  it('points allLessonsTitled at the FIRST lesson missing either title', () => {
    const anchors = computeReadinessAnchors(
      baseCourse({ lessons: [lesson({ id: 'ok' }), lesson({ id: 'bad', title_fr: '' })] }),
    );
    expect(anchors.allLessonsTitled).toEqual({ step: 'plan', anchorId: 'lesson-bad' });
  });

  it('points hasPreviewLesson at the first lesson (any lesson can become the preview)', () => {
    const anchors = computeReadinessAnchors(
      baseCourse({ lessons: [lesson({ id: 'first', isPreview: false }), lesson({ id: 'second' })] }),
    );
    expect(anchors.hasPreviewLesson).toEqual({ step: 'plan', anchorId: 'lesson-first' });
  });
});

describe('computeReadinessAnchors — chapters', () => {
  it('points allChaptersTitled at the FIRST chapter missing either title', () => {
    const anchors = computeReadinessAnchors(
      baseCourse({ chapters: [chapter({ id: 'ok' }), chapter({ id: 'bad', title_ht: '' })] }),
    );
    expect(anchors.allChaptersTitled).toEqual({ step: 'plan', anchorId: 'chapter-bad' });
  });

  it('falls back allChaptersTitled to the add-lesson button when there are no chapters', () => {
    const anchors = computeReadinessAnchors(baseCourse({ chapters: [] }));
    expect(anchors.allChaptersTitled).toEqual({ step: 'plan', anchorId: 'plan-add-lesson' });
  });
});
