import { describe, it, expect } from 'vitest';
import {
  fitWithin,
  deriveAutoAlt,
  uploadBlobName,
  IMAGE_MAX_SIDE,
} from './image-prep';

describe('fitWithin — client resize math', () => {
  it('never upscales an image already within the cap', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(IMAGE_MAX_SIDE, 900)).toEqual({ width: IMAGE_MAX_SIDE, height: 900 });
  });

  it('caps the longest side of a landscape photo at 1600, preserving ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it('caps the longest side of a portrait photo at 1600, preserving ratio', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('rounds to integers (canvas dimensions must be whole pixels)', () => {
    const { width, height } = fitWithin(3333, 2001);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(Math.max(width, height)).toBe(1600);
  });

  it('an extreme panorama never collapses the short side below 1px', () => {
    const { width, height } = fitWithin(100000, 10);
    expect(width).toBe(1600);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('degenerate input (0/negative/NaN) yields a valid 1×1, never 0 or NaN', () => {
    expect(fitWithin(0, 500)).toEqual({ width: 1, height: 1 });
    expect(fitWithin(500, -3)).toEqual({ width: 1, height: 1 });
    expect(fitWithin(Number.NaN, 500)).toEqual({ width: 1, height: 1 });
  });

  it('honours a custom maxSide', () => {
    expect(fitWithin(1000, 500, 100)).toEqual({ width: 100, height: 50 });
  });
});

describe('deriveAutoAlt — auto alt text (no jargon asked of the teacher)', () => {
  it('uses the course title plus the photo number', () => {
    expect(deriveAutoAlt('Zouti finansye dijital', 'zouti-finansye', 2)).toBe(
      'Zouti finansye dijital — foto 2',
    );
  });

  it('falls back to the slug when the title is blank', () => {
    expect(deriveAutoAlt('   ', 'mon-kou', 3)).toBe('mon-kou — foto 3');
  });
});

describe('uploadBlobName — re-encoded upload file name', () => {
  it('replaces the original extension with the re-encoded type', () => {
    expect(uploadBlobName('IMG_1234.HEIC', 'image/webp')).toBe('IMG_1234.webp');
    expect(uploadBlobName('photo.png', 'image/jpeg')).toBe('photo.jpg');
  });

  it('handles a name without extension and an empty name', () => {
    expect(uploadBlobName('foto-kou', 'image/webp')).toBe('foto-kou.webp');
    expect(uploadBlobName('', 'image/jpeg')).toBe('foto.jpg');
  });
});
