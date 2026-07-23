import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bunnyConfigured, bunnyEmbedUrl } from './embed';

describe('bunny embed (env-gated)', () => {
  const ORIGINAL = process.env.BUNNY_STREAM_LIBRARY_ID;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID;
    else process.env.BUNNY_STREAM_LIBRARY_ID = ORIGINAL;
  });

  describe('without BUNNY_STREAM_LIBRARY_ID', () => {
    beforeEach(() => {
      delete process.env.BUNNY_STREAM_LIBRARY_ID;
    });

    it('reports not configured', () => {
      expect(bunnyConfigured()).toBe(false);
    });

    it('returns null even with a videoId', () => {
      expect(bunnyEmbedUrl('abc-123')).toBeNull();
    });

    it('returns null with no videoId', () => {
      expect(bunnyEmbedUrl(undefined)).toBeNull();
      expect(bunnyEmbedUrl(null)).toBeNull();
      expect(bunnyEmbedUrl('')).toBeNull();
    });
  });

  describe('with BUNNY_STREAM_LIBRARY_ID set', () => {
    beforeEach(() => {
      process.env.BUNNY_STREAM_LIBRARY_ID = '12345';
    });

    it('reports configured', () => {
      expect(bunnyConfigured()).toBe(true);
    });

    it('returns null when the lesson has no video id yet', () => {
      expect(bunnyEmbedUrl(undefined)).toBeNull();
      expect(bunnyEmbedUrl('')).toBeNull();
      expect(bunnyEmbedUrl('   ')).toBeNull();
    });

    it('builds the expected iframe embed URL shape', () => {
      const url = bunnyEmbedUrl('video-abc');
      expect(url).toBe(
        'https://iframe.mediadelivery.net/embed/12345/video-abc?autoplay=false&preload=true&responsive=true',
      );
    });

    it('never leaks an API key into the URL (there is none to build one from)', () => {
      const url = bunnyEmbedUrl('video-abc')!;
      expect(url).not.toContain('key');
      expect(url).not.toContain('token');
    });
  });
});
