import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildCollectionName, ensureCourseCollection, BUNNY_COLLECTION_NAME_MAX_LENGTH } from './collections';

describe('buildCollectionName (automatic Bunny organization — per-course collection naming)', () => {
  it('builds "code · title — teacher" when everything is known', () => {
    expect(
      buildCollectionName({ courseCode: 'PA-03', courseTitle: 'Byen Konprann Kredi', teacherName: 'Jean Baptiste' }),
    ).toBe('PA-03 · Byen Konprann Kredi — Jean Baptiste');
  });

  it('omits the code segment when courseCode is null/blank', () => {
    expect(buildCollectionName({ courseCode: null, courseTitle: 'Byen Konprann Kredi', teacherName: 'Jean' })).toBe(
      'Byen Konprann Kredi — Jean',
    );
    expect(buildCollectionName({ courseCode: '  ', courseTitle: 'Byen Konprann Kredi', teacherName: 'Jean' })).toBe(
      'Byen Konprann Kredi — Jean',
    );
  });

  it('falls back to "PNICE Academy" when teacherName is blank', () => {
    expect(buildCollectionName({ courseCode: 'PA-01', courseTitle: 'Kou 1', teacherName: '' })).toBe(
      'PA-01 · Kou 1 — PNICE Academy',
    );
  });

  it('falls back to a placeholder title when courseTitle is blank', () => {
    expect(buildCollectionName({ courseCode: 'PA-01', courseTitle: '  ', teacherName: 'Jean' })).toBe(
      'PA-01 · San tit — Jean',
    );
  });

  it('truncates a very long name to the max length with an ellipsis', () => {
    const name = buildCollectionName({
      courseCode: 'PA-01',
      courseTitle: 'x'.repeat(200),
      teacherName: 'Jean Baptiste',
    });
    expect(name.length).toBe(BUNNY_COLLECTION_NAME_MAX_LENGTH);
    expect(name.endsWith('…')).toBe(true);
  });
});

describe('ensureCourseCollection (env-gated, best-effort — never throws)', () => {
  const ORIGINAL_KEY = process.env.BUNNY_STREAM_API_KEY;
  const ORIGINAL_LIB = process.env.BUNNY_STREAM_LIBRARY_ID;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.BUNNY_STREAM_API_KEY;
    else process.env.BUNNY_STREAM_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_LIB === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID;
    else process.env.BUNNY_STREAM_LIBRARY_ID = ORIGINAL_LIB;
    vi.unstubAllGlobals();
  });

  it('resolves not_configured (no network call) when Bunny env is missing', async () => {
    delete process.env.BUNNY_STREAM_API_KEY;
    delete process.env.BUNNY_STREAM_LIBRARY_ID;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await ensureCourseCollection({
      slug: 'cours-x',
      courseCode: 'PA-01',
      courseTitle: 'Kou',
      teacherName: 'Jean',
      existingCollectionId: null,
    });
    expect(result).toEqual({ ok: false, message: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates a new collection and returns its guid when there is no existing id', async () => {
    process.env.BUNNY_STREAM_API_KEY = 'secret-key';
    process.env.BUNNY_STREAM_LIBRARY_ID = '123';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ guid: 'new-collection-guid' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await ensureCourseCollection({
      slug: 'cours-x',
      courseCode: 'PA-01',
      courseTitle: 'Kou',
      teacherName: 'Jean',
      existingCollectionId: null,
    });
    expect(result).toEqual({ ok: true, collectionId: 'new-collection-guid' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://video.bunnycdn.com/library/123/collections');
    expect(init.method).toBe('POST');
    expect(init.headers.AccessKey).toBe('secret-key');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret-key');
  });

  it('reuses an existing collection id when Bunny confirms it still exists (no create call)', async () => {
    process.env.BUNNY_STREAM_API_KEY = 'k';
    process.env.BUNNY_STREAM_LIBRARY_ID = '1';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await ensureCourseCollection({
      slug: 'cours-x',
      courseCode: 'PA-01',
      courseTitle: 'Kou',
      teacherName: 'Jean',
      existingCollectionId: 'existing-guid',
    });
    expect(result).toEqual({ ok: true, collectionId: 'existing-guid' });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // GET verify only, no POST create
    expect(fetchSpy.mock.calls[0][0]).toBe('https://video.bunnycdn.com/library/1/collections/existing-guid');
  });

  it('recreates a collection when the existing id 404s in Bunny', async () => {
    process.env.BUNNY_STREAM_API_KEY = 'k';
    process.env.BUNNY_STREAM_LIBRARY_ID = '1';
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 }) // verify GET fails
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ guid: 'recreated-guid' }) }); // create POST
    vi.stubGlobal('fetch', fetchSpy);

    const result = await ensureCourseCollection({
      slug: 'cours-x',
      courseCode: 'PA-01',
      courseTitle: 'Kou',
      teacherName: 'Jean',
      existingCollectionId: 'deleted-guid',
    });
    expect(result).toEqual({ ok: true, collectionId: 'recreated-guid' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('reports ok:false without throwing when Bunny create returns a non-OK response', async () => {
    process.env.BUNNY_STREAM_API_KEY = 'k';
    process.env.BUNNY_STREAM_LIBRARY_ID = '1';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }));

    const result = await ensureCourseCollection({
      slug: 'cours-x',
      courseCode: 'PA-01',
      courseTitle: 'Kou',
      teacherName: 'Jean',
      existingCollectionId: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false');
    expect(result.message).toContain('401');
  });

  it('reports ok:false without throwing when fetch itself rejects (network error)', async () => {
    process.env.BUNNY_STREAM_API_KEY = 'k';
    process.env.BUNNY_STREAM_LIBRARY_ID = '1';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await ensureCourseCollection({
      slug: 'cours-x',
      courseCode: 'PA-01',
      courseTitle: 'Kou',
      teacherName: 'Jean',
      existingCollectionId: null,
    });
    expect(result).toEqual({ ok: false, message: 'network down' });
  });
});
