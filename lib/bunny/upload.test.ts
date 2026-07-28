import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bunnyUploadConfigured, bunnyTusSignature, createBunnyVideo, BUNNY_TUS_ENDPOINT } from './upload';

describe('bunny upload (env-gated, key never leaves this module)', () => {
  const ORIGINAL_KEY = process.env.BUNNY_STREAM_API_KEY;
  const ORIGINAL_LIB = process.env.BUNNY_STREAM_LIBRARY_ID;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.BUNNY_STREAM_API_KEY;
    else process.env.BUNNY_STREAM_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_LIB === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID;
    else process.env.BUNNY_STREAM_LIBRARY_ID = ORIGINAL_LIB;
    vi.unstubAllGlobals();
  });

  describe('bunnyUploadConfigured', () => {
    it('is false with neither var set', () => {
      delete process.env.BUNNY_STREAM_API_KEY;
      delete process.env.BUNNY_STREAM_LIBRARY_ID;
      expect(bunnyUploadConfigured()).toBe(false);
    });

    it('is false with only the api key set', () => {
      process.env.BUNNY_STREAM_API_KEY = 'k';
      delete process.env.BUNNY_STREAM_LIBRARY_ID;
      expect(bunnyUploadConfigured()).toBe(false);
    });

    it('is false with only the library id set', () => {
      delete process.env.BUNNY_STREAM_API_KEY;
      process.env.BUNNY_STREAM_LIBRARY_ID = '123';
      expect(bunnyUploadConfigured()).toBe(false);
    });

    it('is true with both set', () => {
      process.env.BUNNY_STREAM_API_KEY = 'k';
      process.env.BUNNY_STREAM_LIBRARY_ID = '123';
      expect(bunnyUploadConfigured()).toBe(true);
    });
  });

  describe('bunnyTusSignature (pure fn — the exact contract Bunny verifies)', () => {
    it('is SHA256 hex of libraryId+apiKey+expire+videoGuid concatenated with no delimiter', () => {
      const libraryId = '456';
      const apiKey = 'test-secret-key';
      const expire = 1_700_000_000;
      const guid = 'video-guid-123';
      const expected = createHash('sha256').update(`${libraryId}${apiKey}${expire}${guid}`).digest('hex');
      const actual = bunnyTusSignature(libraryId, apiKey, expire, guid);
      expect(actual).toBe(expected);
      expect(actual).toHaveLength(64);
      expect(actual).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same inputs', () => {
      expect(bunnyTusSignature('a', 'b', 1, 'c')).toBe(bunnyTusSignature('a', 'b', 1, 'c'));
    });

    it('changes when any one input changes', () => {
      const base = bunnyTusSignature('1', 'key', 100, 'guid');
      expect(bunnyTusSignature('2', 'key', 100, 'guid')).not.toBe(base);
      expect(bunnyTusSignature('1', 'other', 100, 'guid')).not.toBe(base);
      expect(bunnyTusSignature('1', 'key', 200, 'guid')).not.toBe(base);
      expect(bunnyTusSignature('1', 'key', 100, 'other-guid')).not.toBe(base);
    });
  });

  describe('createBunnyVideo', () => {
    it('resolves not_configured (no network call) when env is missing', async () => {
      delete process.env.BUNNY_STREAM_API_KEY;
      delete process.env.BUNNY_STREAM_LIBRARY_ID;
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const result = await createBunnyVideo('Lesson 1');
      expect(result).toEqual({ ok: false, message: 'not_configured' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never puts the api key in the returned payload — only guid/libraryId/signature/expire/endpoint', async () => {
      process.env.BUNNY_STREAM_API_KEY = 'super-secret-key';
      process.env.BUNNY_STREAM_LIBRARY_ID = '789';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 201,
          json: async () => ({ guid: 'new-video-guid' }),
        }),
      );

      const result = await createBunnyVideo('Ti leson 1');
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok:true');
      expect(result.guid).toBe('new-video-guid');
      expect(result.libraryId).toBe('789');
      expect(result.tusEndpoint).toBe(BUNNY_TUS_ENDPOINT);
      expect(typeof result.signature).toBe('string');
      expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
      expect(result.signature).not.toContain('super-secret-key');

      // The signature must match the pure fn given the same inputs (proves
      // the wiring, not just that *a* hash was produced).
      expect(result.signature).toBe(bunnyTusSignature('789', 'super-secret-key', result.expire, 'new-video-guid'));

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('super-secret-key');
    });

    it('reports ok:false with no throw when Bunny returns a non-OK response', async () => {
      process.env.BUNNY_STREAM_API_KEY = 'k';
      process.env.BUNNY_STREAM_LIBRARY_ID = '1';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }),
      );
      const result = await createBunnyVideo('x');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected ok:false');
      expect(result.message).toContain('401');
      expect(result.message).not.toContain('k');
    });
  });
});
