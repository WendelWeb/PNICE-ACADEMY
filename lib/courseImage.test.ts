/**
 * Unit tests for Stage 3's DB-first image resolution (lib/courseImage.ts).
 * `ZZ-TEST-99` has no /public/images/courses/zz-test-99.* file, so the
 * filesystem fallback deterministically resolves the branded SVG placeholder
 * in this test environment.
 */
import { describe, it, expect } from 'vitest';
import { courseImageList, courseMainImage, absoluteImageUrl } from './courseImage';

const CODE = 'ZZ-TEST-99';
const SVG_FALLBACK = '/images/courses/zz-test-99.svg';

describe('courseImageList — DB images → filesystem → SVG placeholder', () => {
  it('teacher-set DB main + secondary win over the filesystem', () => {
    expect(
      courseImageList(
        {
          main: 'https://cdn.example.b-cdn.net/courses/x/image/a.webp',
          secondary: [
            { url: 'https://cdn.example.b-cdn.net/courses/x/image/b.webp', alt: 'b' },
            { url: 'https://cdn.example.b-cdn.net/courses/x/image/c.webp', alt: 'c' },
          ],
        },
        CODE,
      ),
    ).toEqual([
      'https://cdn.example.b-cdn.net/courses/x/image/a.webp',
      'https://cdn.example.b-cdn.net/courses/x/image/b.webp',
      'https://cdn.example.b-cdn.net/courses/x/image/c.webp',
    ]);
  });

  it('a main-only set is a one-frame gallery', () => {
    expect(courseImageList({ main: 'https://cdn.test/a.webp' }, CODE)).toEqual([
      'https://cdn.test/a.webp',
    ]);
  });

  it('a main-less set still shows its secondary photos (main was removed)', () => {
    expect(
      courseImageList({ secondary: [{ url: 'https://cdn.test/b.webp', alt: '' }] }, CODE),
    ).toEqual(['https://cdn.test/b.webp']);
  });

  it('blank/whitespace URLs are dropped, falling through to the placeholder', () => {
    expect(courseImageList({ main: '   ', secondary: [{ url: ' ' }] }, CODE)).toEqual([
      SVG_FALLBACK,
    ]);
  });

  it('no DB images (static-fallback course) resolves exactly as before Stage 3', () => {
    expect(courseImageList(undefined, CODE)).toEqual([SVG_FALLBACK]);
    expect(courseImageList(null, CODE)).toEqual([SVG_FALLBACK]);
    expect(courseImageList({}, CODE)).toEqual([SVG_FALLBACK]);
  });
});

describe('courseMainImage — the single "face" image', () => {
  it('is the first resolved frame', () => {
    expect(
      courseMainImage(
        { main: 'https://cdn.test/a.webp', secondary: [{ url: 'https://cdn.test/b.webp' }] },
        CODE,
      ),
    ).toBe('https://cdn.test/a.webp');
    expect(courseMainImage(undefined, CODE)).toBe(SVG_FALLBACK);
  });
});

describe('absoluteImageUrl — og:image must be absolute', () => {
  it('prefixes a local path with the site base', () => {
    expect(absoluteImageUrl('/images/courses/pa-01.svg', 'https://pnice.academy')).toBe(
      'https://pnice.academy/images/courses/pa-01.svg',
    );
  });

  it('tolerates a trailing slash on the base and a missing leading slash on the path', () => {
    expect(absoluteImageUrl('/x.jpg', 'https://pnice.academy/')).toBe('https://pnice.academy/x.jpg');
    expect(absoluteImageUrl('x.jpg', 'https://pnice.academy')).toBe('https://pnice.academy/x.jpg');
  });

  it('passes an already-absolute URL through untouched', () => {
    expect(absoluteImageUrl('https://cdn.test/a.webp', 'https://pnice.academy')).toBe(
      'https://cdn.test/a.webp',
    );
    expect(absoluteImageUrl('http://cdn.test/a.webp', 'https://pnice.academy')).toBe(
      'http://cdn.test/a.webp',
    );
  });
});
