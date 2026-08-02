import { describe, it, expect, afterEach, vi } from 'vitest';
import { bunnyStorageConfigured, uploadToBunnyStorage, deleteFromBunnyStorage } from './storage';

describe('bunny storage (env-gated, key never leaves this module)', () => {
  const ORIGINAL = {
    zone: process.env.BUNNY_STORAGE_ZONE_NAME,
    key: process.env.BUNNY_STORAGE_API_KEY,
    cdn: process.env.BUNNY_STORAGE_CDN_BASE,
    host: process.env.BUNNY_STORAGE_HOST,
  };

  function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  function configure(overrides: Partial<{ zone: string; key: string; cdn: string }> = {}) {
    process.env.BUNNY_STORAGE_ZONE_NAME = overrides.zone ?? 'pnice-assets';
    process.env.BUNNY_STORAGE_API_KEY = overrides.key ?? 'storage-secret-key';
    process.env.BUNNY_STORAGE_CDN_BASE = overrides.cdn ?? 'https://pnice-assets.b-cdn.net';
  }

  afterEach(() => {
    restore('BUNNY_STORAGE_ZONE_NAME', ORIGINAL.zone);
    restore('BUNNY_STORAGE_API_KEY', ORIGINAL.key);
    restore('BUNNY_STORAGE_CDN_BASE', ORIGINAL.cdn);
    restore('BUNNY_STORAGE_HOST', ORIGINAL.host);
    vi.unstubAllGlobals();
  });

  describe('bunnyStorageConfigured', () => {
    it('is false with nothing set', () => {
      delete process.env.BUNNY_STORAGE_ZONE_NAME;
      delete process.env.BUNNY_STORAGE_API_KEY;
      delete process.env.BUNNY_STORAGE_CDN_BASE;
      expect(bunnyStorageConfigured()).toBe(false);
    });

    it('is false when any ONE of the three vars is missing', () => {
      for (const missing of ['BUNNY_STORAGE_ZONE_NAME', 'BUNNY_STORAGE_API_KEY', 'BUNNY_STORAGE_CDN_BASE']) {
        configure();
        delete process.env[missing];
        expect(bunnyStorageConfigured()).toBe(false);
      }
    });

    it('is false on whitespace-only values', () => {
      configure({ zone: '   ' });
      expect(bunnyStorageConfigured()).toBe(false);
    });

    it('is true with all three set', () => {
      configure();
      expect(bunnyStorageConfigured()).toBe(true);
    });
  });

  describe('uploadToBunnyStorage', () => {
    it('resolves not_configured (no network call) when env is missing', async () => {
      delete process.env.BUNNY_STORAGE_ZONE_NAME;
      delete process.env.BUNNY_STORAGE_API_KEY;
      delete process.env.BUNNY_STORAGE_CDN_BASE;
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const result = await uploadToBunnyStorage('courses/s/image/a.png', new ArrayBuffer(4), 'image/png');
      expect(result).toEqual({ ok: false, message: 'not_configured' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('PUTs to storage.bunnycdn.com/{zone}/{path} with the AccessKey header and returns the CDN url', async () => {
      configure();
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201 });
      vi.stubGlobal('fetch', fetchSpy);

      const bytes = new ArrayBuffer(8);
      const result = await uploadToBunnyStorage('courses/kou-a/image/abc-foto.png', bytes, 'image/png');
      expect(result).toEqual({ ok: true, url: 'https://pnice-assets.b-cdn.net/courses/kou-a/image/abc-foto.png' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://storage.bunnycdn.com/pnice-assets/courses/kou-a/image/abc-foto.png');
      expect(init.method).toBe('PUT');
      expect(init.headers.AccessKey).toBe('storage-secret-key');
      expect(init.headers['content-type']).toBe('image/png');
      expect(init.body).toBe(bytes);
    });

    it('never puts the api key in the returned value (success or failure)', async () => {
      configure({ key: 'super-secret-storage-key' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201 }));
      const okResult = await uploadToBunnyStorage('courses/s/image/a.png', new ArrayBuffer(1), 'image/png');
      expect(JSON.stringify(okResult)).not.toContain('super-secret-storage-key');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }));
      const badResult = await uploadToBunnyStorage('courses/s/image/a.png', new ArrayBuffer(1), 'image/png');
      expect(JSON.stringify(badResult)).not.toContain('super-secret-storage-key');
    });

    it('normalises the CDN base: trailing slash removed, https:// prepended on a bare host', async () => {
      configure({ cdn: 'pnice-assets.b-cdn.net/' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201 }));
      const result = await uploadToBunnyStorage('courses/s/image/a.png', new ArrayBuffer(1), 'image/png');
      expect(result).toEqual({ ok: true, url: 'https://pnice-assets.b-cdn.net/courses/s/image/a.png' });
    });

    it('refuses unsafe paths without any network call (defence in depth)', async () => {
      configure();
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      for (const bad of ['', '/absolute/a.png', 'courses/../secrets.txt', 'courses/s/image/a b.png', 'courses/S/IMG.png']) {
        const result = await uploadToBunnyStorage(bad, new ArrayBuffer(1), 'image/png');
        expect(result).toEqual({ ok: false, message: 'bad_path' });
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reports ok:false with no throw on a non-OK response', async () => {
      configure();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' }));
      const result = await uploadToBunnyStorage('courses/s/image/a.png', new ArrayBuffer(1), 'image/png');
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected ok:false');
      expect(result.message).toContain('403');
    });

    it('reports ok:false with no throw when fetch itself rejects (network error)', async () => {
      configure();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const result = await uploadToBunnyStorage('courses/s/image/a.png', new ArrayBuffer(1), 'image/png');
      expect(result).toEqual({ ok: false, message: 'network down' });
    });

    it('honours BUNNY_STORAGE_HOST for non-default regions', async () => {
      configure();
      process.env.BUNNY_STORAGE_HOST = 'ny.storage.bunnycdn.com';
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201 });
      vi.stubGlobal('fetch', fetchSpy);
      await uploadToBunnyStorage('courses/s/image/a.png', new ArrayBuffer(1), 'image/png');
      expect(fetchSpy.mock.calls[0][0]).toBe('https://ny.storage.bunnycdn.com/pnice-assets/courses/s/image/a.png');
    });
  });

  describe('deleteFromBunnyStorage (best-effort, never throws)', () => {
    it('no-ops (no network call) when env is missing', async () => {
      delete process.env.BUNNY_STORAGE_ZONE_NAME;
      delete process.env.BUNNY_STORAGE_API_KEY;
      delete process.env.BUNNY_STORAGE_CDN_BASE;
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      await expect(deleteFromBunnyStorage('courses/s/image/a.png')).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('no-ops on blank or unsafe paths', async () => {
      configure();
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      await deleteFromBunnyStorage('   ');
      await deleteFromBunnyStorage('courses/../x');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls DELETE on the storage endpoint with the AccessKey header', async () => {
      configure();
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchSpy);
      await deleteFromBunnyStorage('courses/s/resource/abc-devoir.pdf');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://storage.bunnycdn.com/pnice-assets/courses/s/resource/abc-devoir.pdf');
      expect(init.method).toBe('DELETE');
      expect(init.headers.AccessKey).toBe('storage-secret-key');
    });

    it('never throws on a non-OK response', async () => {
      configure();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' }));
      await expect(deleteFromBunnyStorage('courses/s/image/missing.png')).resolves.toBeUndefined();
    });

    it('never throws when fetch itself rejects', async () => {
      configure();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(deleteFromBunnyStorage('courses/s/image/a.png')).resolves.toBeUndefined();
    });
  });
});
