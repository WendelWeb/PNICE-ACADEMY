import { describe, it, expect } from 'vitest';
import { buildBunnyVideoTitle, BUNNY_VIDEO_TITLE_MAX_LENGTH } from './naming';

describe('buildBunnyVideoTitle (automatic Bunny organization — structured video titles)', () => {
  it('builds the full segment set: code · chapter (with title) · lesson (with title)', () => {
    const title = buildBunnyVideoTitle({
      courseCode: 'PA-03',
      chapterIndex: 2,
      chapterTitle: { ht: 'Jere lajan ou', fr: 'Gérer son argent' },
      lessonIndex: 3,
      lessonTitle: { ht: 'Negosye ak yon depo', fr: 'Négocier avec un dépôt' },
    });
    expect(title).toBe('PA-03 · Pati 2 · Jere lajan ou · Leson 3 · Negosye ak yon depo');
  });

  it('omits the "Pati" segment entirely when the lesson has no chapter', () => {
    const title = buildBunnyVideoTitle({
      courseCode: 'PA-03',
      chapterIndex: null,
      chapterTitle: null,
      lessonIndex: 3,
      lessonTitle: { ht: 'Negosye ak yon depo', fr: '' },
    });
    expect(title).toBe('PA-03 · Leson 3 · Negosye ak yon depo');
    expect(title).not.toContain('Pati');
  });

  it('omits the course-code segment when null/blank', () => {
    expect(
      buildBunnyVideoTitle({
        courseCode: null,
        chapterIndex: null,
        chapterTitle: null,
        lessonIndex: 1,
        lessonTitle: { ht: 'Entwodiksyon', fr: '' },
      }),
    ).toBe('Leson 1 · Entwodiksyon');

    expect(
      buildBunnyVideoTitle({
        courseCode: '   ',
        chapterIndex: null,
        chapterTitle: null,
        lessonIndex: 1,
        lessonTitle: { ht: 'Entwodiksyon', fr: '' },
      }),
    ).toBe('Leson 1 · Entwodiksyon');
  });

  it('renders "Pati N" alone when the chapter has no title in either language', () => {
    const title = buildBunnyVideoTitle({
      courseCode: 'PA-01',
      chapterIndex: 1,
      chapterTitle: { ht: '', fr: '   ' },
      lessonIndex: 1,
      lessonTitle: { ht: 'X', fr: '' },
    });
    expect(title).toBe('PA-01 · Pati 1 · Leson 1 · X');
  });

  it('falls back lesson title ht -> fr when ht is blank', () => {
    const title = buildBunnyVideoTitle({
      courseCode: null,
      chapterIndex: null,
      chapterTitle: null,
      lessonIndex: 5,
      lessonTitle: { ht: '   ', fr: 'Titre français' },
    });
    expect(title).toBe('Leson 5 · Titre français');
  });

  it('falls back chapter title ht -> fr when ht is blank', () => {
    const title = buildBunnyVideoTitle({
      courseCode: null,
      chapterIndex: 4,
      chapterTitle: { ht: '', fr: 'Chapitre français' },
      lessonIndex: 1,
      lessonTitle: { ht: 'x', fr: '' },
    });
    expect(title).toBe('Pati 4 · Chapitre français · Leson 1 · x');
  });

  it('uses a placeholder when the lesson title is blank in both languages', () => {
    const title = buildBunnyVideoTitle({
      courseCode: null,
      chapterIndex: null,
      chapterTitle: null,
      lessonIndex: 1,
      lessonTitle: { ht: '  ', fr: '' },
    });
    expect(title).toBe('Leson 1 · San tit');
  });

  it('truncates a very long title to the max length with an ellipsis', () => {
    const longTitle = 'x'.repeat(300);
    const title = buildBunnyVideoTitle({
      courseCode: 'PA-09',
      chapterIndex: 1,
      chapterTitle: { ht: 'y'.repeat(50), fr: '' },
      lessonIndex: 1,
      lessonTitle: { ht: longTitle, fr: '' },
    });
    expect(title.length).toBe(BUNNY_VIDEO_TITLE_MAX_LENGTH);
    expect(title.endsWith('…')).toBe(true);
  });

  it('never truncates a title already under the limit', () => {
    const title = buildBunnyVideoTitle({
      courseCode: 'PA-02',
      chapterIndex: null,
      chapterTitle: null,
      lessonIndex: 1,
      lessonTitle: { ht: 'Short', fr: '' },
    });
    expect(title).toBe('PA-02 · Leson 1 · Short');
    expect(title.endsWith('…')).toBe(false);
  });
});
