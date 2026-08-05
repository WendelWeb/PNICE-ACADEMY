import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { bunnyConfigured, bunnyEmbedUrl, bunnyTokenAuthConfigured } from './embed';

describe('bunny embed (env-gated)', () => {
  const ORIGINAL = process.env.BUNNY_STREAM_LIBRARY_ID;
  const ORIGINAL_TOKEN_KEY = process.env.BUNNY_EMBED_TOKEN_KEY;

  beforeEach(() => {
    // Hermetic against whatever the ambient shell/.env.local has set — every
    // test in this file starts with token auth OFF unless it opts in.
    delete process.env.BUNNY_EMBED_TOKEN_KEY;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID;
    else process.env.BUNNY_STREAM_LIBRARY_ID = ORIGINAL;
    if (ORIGINAL_TOKEN_KEY === undefined) delete process.env.BUNNY_EMBED_TOKEN_KEY;
    else process.env.BUNNY_EMBED_TOKEN_KEY = ORIGINAL_TOKEN_KEY;
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

  describe('bunnyTokenAuthConfigured', () => {
    it('is false with no BUNNY_EMBED_TOKEN_KEY', () => {
      expect(bunnyTokenAuthConfigured()).toBe(false);
    });

    it('is false for a blank/whitespace-only key', () => {
      process.env.BUNNY_EMBED_TOKEN_KEY = '   ';
      expect(bunnyTokenAuthConfigured()).toBe(false);
    });

    it('is true once a key is set', () => {
      process.env.BUNNY_EMBED_TOKEN_KEY = 'super-secret';
      expect(bunnyTokenAuthConfigured()).toBe(true);
    });
  });

  describe('signed embed (BUNNY_EMBED_TOKEN_KEY set)', () => {
    beforeEach(() => {
      process.env.BUNNY_STREAM_LIBRARY_ID = '12345';
      process.env.BUNNY_EMBED_TOKEN_KEY = 'super-secret-key';
    });

    it('appends token + expires query params', () => {
      const url = bunnyEmbedUrl('video-abc')!;
      const parsed = new URL(url);
      expect(parsed.searchParams.get('token')).toMatch(/^[0-9a-f]{64}$/);
      expect(parsed.searchParams.get('expires')).toMatch(/^\d+$/);
    });

    it('signs exactly sha256_hex(key + videoId + expires) — Bunny\'s documented scheme', () => {
      const url = bunnyEmbedUrl('video-abc')!;
      const parsed = new URL(url);
      const expires = parsed.searchParams.get('expires')!;
      const expected = createHash('sha256')
        .update(`super-secret-key${'video-abc'}${expires}`)
        .digest('hex');
      expect(parsed.searchParams.get('token')).toBe(expected);
    });

    it('sets an expiry in the future (within the documented TTL window)', () => {
      const url = bunnyEmbedUrl('video-abc')!;
      const expires = Number(new URL(url).searchParams.get('expires'));
      const nowSeconds = Math.floor(Date.now() / 1000);
      expect(expires).toBeGreaterThan(nowSeconds);
      expect(expires).toBeLessThanOrEqual(nowSeconds + 6 * 60 * 60 + 5);
    });

    it('never leaks the signing key itself into the URL', () => {
      const url = bunnyEmbedUrl('video-abc')!;
      expect(url).not.toContain('super-secret-key');
    });

    it('still returns null with no videoId, even when token auth is configured', () => {
      expect(bunnyEmbedUrl(undefined)).toBeNull();
      expect(bunnyEmbedUrl('')).toBeNull();
    });

    it('two different video ids sign to two different tokens', () => {
      const urlA = new URL(bunnyEmbedUrl('video-a')!);
      const urlB = new URL(bunnyEmbedUrl('video-b')!);
      expect(urlA.searchParams.get('token')).not.toBe(urlB.searchParams.get('token'));
    });
  });
});
