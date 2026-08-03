import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  tusUpload,
  tusBackoffMs,
  parseTusOffset,
  resolveTusUploadUrl,
  browserTusTransport,
  TUS_CHUNK_BYTES,
  TUS_MAX_RETRIES,
  type TusTransport,
  type TusCreateResult,
  type TusPatchResult,
  type TusHeadResult,
} from './tus-client';

const ENDPOINT = 'https://video.bunnycdn.com/tusupload';
const UPLOAD_URL = 'https://video.bunnycdn.com/tusupload/abc-123';
const AUTH = {
  AuthorizationSignature: 'sig',
  AuthorizationExpire: '1700000000',
  VideoId: 'guid-1',
  LibraryId: '456',
};

function makeFile(size: number): Blob {
  return new Blob([new Uint8Array(size)]);
}

/** No-op sleep that records the requested backoff delays. */
function instantSleep() {
  const delays: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    delays.push(ms);
  });
  return { sleep, delays };
}

type TransportLog = {
  creates: Array<Record<string, string>>;
  patches: Array<{ offset: string; size: number }>;
  heads: number;
};

/** Scriptable fake transport: `patchScript`/`headScript` are consumed one
 *  result per call; when a script runs out, the default success applies. */
function makeTransport(opts?: {
  create?: TusCreateResult;
  patchScript?: TusPatchResult[];
  headScript?: TusHeadResult[];
  headOffset?: number;
}): { transport: TusTransport; log: TransportLog } {
  const log: TransportLog = { creates: [], patches: [], heads: 0 };
  const patchScript = [...(opts?.patchScript ?? [])];
  const headScript = [...(opts?.headScript ?? [])];
  const transport: TusTransport = {
    async create(_endpoint, headers) {
      log.creates.push(headers);
      return opts?.create ?? { ok: true, location: UPLOAD_URL };
    },
    async patch(_url, headers, chunk) {
      log.patches.push({ offset: headers['Upload-Offset'], size: chunk.size });
      const scripted = patchScript.shift();
      if (scripted) return scripted;
      return { ok: true, offset: Number(headers['Upload-Offset']) + chunk.size };
    },
    async head() {
      log.heads += 1;
      const scripted = headScript.shift();
      if (scripted) return scripted;
      return { ok: true, offset: opts?.headOffset ?? 0 };
    },
  };
  return { transport, log };
}

describe('tusBackoffMs (exponential: 1s, 2s, 4s, 8s, 16s, capped 30s)', () => {
  it('doubles per retry from 1s', () => {
    expect(tusBackoffMs(1)).toBe(1000);
    expect(tusBackoffMs(2)).toBe(2000);
    expect(tusBackoffMs(3)).toBe(4000);
    expect(tusBackoffMs(4)).toBe(8000);
    expect(tusBackoffMs(5)).toBe(16000);
  });
  it('caps at 30s for out-of-range retry counts', () => {
    expect(tusBackoffMs(10)).toBe(30000);
    expect(tusBackoffMs(0)).toBe(1000);
  });
});

describe('parseTusOffset (strict — a missing header must NOT read as 0)', () => {
  it('parses pure digit strings', () => {
    expect(parseTusOffset('0')).toBe(0);
    expect(parseTusOffset('8388608')).toBe(8388608);
    expect(parseTusOffset(' 42 ')).toBe(42);
  });
  it('rejects null/empty/garbage', () => {
    expect(parseTusOffset(null)).toBeNull();
    expect(parseTusOffset(undefined)).toBeNull();
    expect(parseTusOffset('')).toBeNull();
    expect(parseTusOffset('abc')).toBeNull();
    expect(parseTusOffset('12x')).toBeNull();
    expect(parseTusOffset('-5')).toBeNull();
  });
});

describe('resolveTusUploadUrl', () => {
  it('keeps an absolute Location', () => {
    expect(resolveTusUploadUrl(ENDPOINT, UPLOAD_URL)).toBe(UPLOAD_URL);
  });
  it('resolves a relative Location against the endpoint', () => {
    expect(resolveTusUploadUrl(ENDPOINT, '/tusupload/abc-123')).toBe(UPLOAD_URL);
  });
  it('is null for garbage', () => {
    expect(resolveTusUploadUrl('not a url', '::::')).toBeNull();
  });
});

describe('tusUpload — happy path', () => {
  it('creates with Upload-Length + Upload-Metadata + auth headers, then PATCHes sequential chunks', async () => {
    const { transport, log } = makeTransport();
    const { sleep } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(10),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: 'filetype dmlkZW8vbXA0,title VGl0',
      chunkBytes: 4,
      transport,
      sleep,
    });

    expect(outcome).toEqual({ ok: true, uploadUrl: UPLOAD_URL });
    expect(log.creates).toHaveLength(1);
    expect(log.creates[0]['Upload-Length']).toBe('10');
    expect(log.creates[0]['Upload-Metadata']).toBe('filetype dmlkZW8vbXA0,title VGl0');
    expect(log.creates[0].AuthorizationSignature).toBe('sig');
    expect(log.creates[0].VideoId).toBe('guid-1');
    // 10 bytes in 4-byte chunks → offsets 0, 4, 8 with sizes 4, 4, 2.
    expect(log.patches).toEqual([
      { offset: '0', size: 4 },
      { offset: '4', size: 4 },
      { offset: '8', size: 2 },
    ]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reports monotonic acked progress, ending at the full size', async () => {
    const { transport } = makeTransport();
    const progress: number[] = [];
    const outcome = await tusUpload({
      file: makeFile(10),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      onProgress: (sent, total) => progress.push((sent / total) * 100),
    });
    expect(outcome.ok).toBe(true);
    expect(progress[progress.length - 1]).toBe(100);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it('treats the server-acked Upload-Offset as authoritative for the next chunk', async () => {
    // Server acks only 2 of the 4 bytes sent in the first chunk.
    const { transport, log } = makeTransport({ patchScript: [{ ok: true, offset: 2 }] });
    const outcome = await tusUpload({
      file: makeFile(6),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
    });
    expect(outcome.ok).toBe(true);
    expect(log.patches.map((p) => p.offset)).toEqual(['0', '2']);
    expect(log.patches[1].size).toBe(4); // 6 - 2 acked
  });

  it('defaults to 8 MB chunks and 5 retries', () => {
    expect(TUS_CHUNK_BYTES).toBe(8 * 1024 * 1024);
    expect(TUS_MAX_RETRIES).toBe(5);
  });
});

describe('tusUpload — retry, backoff, HEAD resync', () => {
  it('retries a network-failed chunk with exponential backoff, resyncing offset via HEAD first', async () => {
    const { transport, log } = makeTransport({
      patchScript: [
        { ok: false, kind: 'network' },
        { ok: false, kind: 'network' },
      ],
      headScript: [
        { ok: true, offset: 0 },
        { ok: true, offset: 0 },
      ],
    });
    const { sleep, delays } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      sleep,
    });
    expect(outcome.ok).toBe(true);
    expect(delays).toEqual([1000, 2000]);
    expect(log.heads).toBe(2); // one resync per retry
    expect(log.patches).toHaveLength(3);
  });

  it('gives up after maxRetries consecutive failures with reason network_exhausted + the resumable URL', async () => {
    const { transport } = makeTransport({
      patchScript: Array(6).fill({ ok: false, kind: 'network' }),
      headScript: Array(6).fill({ ok: true, offset: 0 }),
    });
    const { sleep, delays } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      sleep,
    });
    expect(outcome).toEqual({ ok: false, reason: 'network_exhausted', uploadUrl: UPLOAD_URL });
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('resets the failure counter after every acked chunk (a long flaky upload is not capped at 5 hiccups total)', async () => {
    const fail: TusPatchResult = { ok: false, kind: 'network' };
    const { transport } = makeTransport({
      // Chunk 1: 2 failures then success; chunk 2: 2 failures then success —
      // 4 failures total but never more than maxRetries=2 CONSECUTIVE.
      patchScript: [fail, fail, { ok: true, offset: 4 }, fail, fail, { ok: true, offset: 8 }],
      headScript: [
        { ok: true, offset: 0 },
        { ok: true, offset: 0 },
        { ok: true, offset: 4 },
        { ok: true, offset: 4 },
      ],
    });
    const { sleep, delays } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(8),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      maxRetries: 2,
      transport,
      sleep,
    });
    expect(outcome.ok).toBe(true);
    expect(delays).toEqual([1000, 2000, 1000, 2000]);
  });

  it('rewinds to the server-acked offset when the HEAD resync says less was stored', async () => {
    const { transport, log } = makeTransport({
      patchScript: [{ ok: false, kind: 'network' }],
      headScript: [{ ok: true, offset: 0 }],
    });
    const { sleep } = instantSleep();
    await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      sleep,
    });
    // Retry PATCH restarts at the HEAD-acked 0, not a blind resend marker.
    expect(log.patches.map((p) => p.offset)).toEqual(['0', '0']);
  });

  it('keeps the current offset when the resync HEAD itself network-fails (next PATCH will 409 back into retry)', async () => {
    const { transport, log } = makeTransport({
      patchScript: [{ ok: false, kind: 'network' }],
      headScript: [{ ok: false, kind: 'network' }],
    });
    const { sleep } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      sleep,
    });
    expect(outcome.ok).toBe(true);
    expect(log.patches.map((p) => p.offset)).toEqual(['0', '0']);
  });

  it('also retries a network-failed creation with backoff before giving up', async () => {
    const { transport } = makeTransport({ create: { ok: false, kind: 'network' } });
    const { sleep, delays } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      maxRetries: 2,
      transport,
      sleep,
    });
    expect(outcome).toEqual({ ok: false, reason: 'network_exhausted', uploadUrl: null });
    expect(delays).toEqual([1000, 2000]);
  });
});

describe('tusUpload — resume from an existing upload URL', () => {
  it('skips creation, HEAD-resyncs, and continues from the server-acked offset', async () => {
    const { transport, log } = makeTransport({ headOffset: 8 });
    const progress: number[] = [];
    const outcome = await tusUpload({
      file: makeFile(10),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      existingUploadUrl: UPLOAD_URL,
      transport,
      onProgress: (sent) => progress.push(sent),
    });
    expect(outcome).toEqual({ ok: true, uploadUrl: UPLOAD_URL });
    expect(log.creates).toHaveLength(0);
    expect(log.patches).toEqual([{ offset: '8', size: 2 }]); // NOT from zero
    expect(progress[0]).toBe(8); // progress starts where the server left off
  });

  it('reports gone when the resume HEAD answers 404 (upload resource no longer exists)', async () => {
    const { transport, log } = makeTransport({ headScript: [{ ok: false, kind: 'http', status: 404 }] });
    const outcome = await tusUpload({
      file: makeFile(10),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      existingUploadUrl: UPLOAD_URL,
      transport,
    });
    expect(outcome).toEqual({ ok: false, reason: 'gone', uploadUrl: UPLOAD_URL });
    expect(log.patches).toHaveLength(0);
  });
});

describe('tusUpload — protocol fallback + fatal statuses', () => {
  it("reports unsupported (caller falls back to single-shot) when creation is rejected — no chunks sent", async () => {
    const { transport, log } = makeTransport({ create: { ok: false, kind: 'unsupported' } });
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      transport,
    });
    expect(outcome).toEqual({ ok: false, reason: 'unsupported', uploadUrl: null });
    expect(log.patches).toHaveLength(0);
  });

  it('maps a 413 on creation to too_large', async () => {
    const { transport } = makeTransport({ create: { ok: false, kind: 'http', status: 413 } });
    const outcome = await tusUpload({ file: makeFile(4), endpoint: ENDPOINT, headers: AUTH, metadata: '', transport });
    expect(outcome).toEqual({ ok: false, reason: 'too_large', uploadUrl: null });
  });

  it('maps a 413 on a chunk PATCH to too_large without retrying', async () => {
    const { transport } = makeTransport({ patchScript: [{ ok: false, kind: 'http', status: 413 }] });
    const { sleep } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      sleep,
    });
    expect(outcome).toEqual({ ok: false, reason: 'too_large', uploadUrl: UPLOAD_URL });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('maps a 403 on a chunk PATCH (expired signature) to gone without retrying', async () => {
    const { transport } = makeTransport({ patchScript: [{ ok: false, kind: 'http', status: 403 }] });
    const { sleep } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      sleep,
    });
    expect(outcome).toEqual({ ok: false, reason: 'gone', uploadUrl: UPLOAD_URL });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a 409 offset conflict (resynced) instead of failing', async () => {
    const { transport, log } = makeTransport({
      patchScript: [{ ok: false, kind: 'http', status: 409 }],
      headScript: [{ ok: true, offset: 0 }],
    });
    const { sleep } = instantSleep();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
      sleep,
    });
    expect(outcome.ok).toBe(true);
    expect(log.heads).toBe(1);
  });
});

describe('tusUpload — cancellation', () => {
  it('resolves aborted immediately on a pre-aborted signal, touching nothing', async () => {
    const { transport, log } = makeTransport();
    const controller = new AbortController();
    controller.abort();
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      signal: controller.signal,
      transport,
    });
    expect(outcome).toEqual({ ok: false, reason: 'aborted', uploadUrl: null });
    expect(log.creates).toHaveLength(0);
    expect(log.patches).toHaveLength(0);
  });

  it('resolves aborted when the transport reports an aborted chunk', async () => {
    const { transport } = makeTransport({ patchScript: [{ ok: false, kind: 'aborted' }] });
    const outcome = await tusUpload({
      file: makeFile(4),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      transport,
    });
    expect(outcome).toEqual({ ok: false, reason: 'aborted', uploadUrl: UPLOAD_URL });
  });

  it('stops between chunks when the signal aborts mid-upload', async () => {
    const controller = new AbortController();
    const log: TransportLog = { creates: [], patches: [], heads: 0 };
    const transport: TusTransport = {
      async create() {
        return { ok: true, location: UPLOAD_URL };
      },
      async patch(_url, headers, chunk) {
        log.patches.push({ offset: headers['Upload-Offset'], size: chunk.size });
        controller.abort(); // connection dies right after the first chunk lands
        return { ok: true, offset: Number(headers['Upload-Offset']) + chunk.size };
      },
      async head() {
        return { ok: true, offset: 0 };
      },
    };
    const outcome = await tusUpload({
      file: makeFile(8),
      endpoint: ENDPOINT,
      headers: AUTH,
      metadata: '',
      chunkBytes: 4,
      signal: controller.signal,
      transport,
    });
    expect(outcome).toEqual({ ok: false, reason: 'aborted', uploadUrl: UPLOAD_URL });
    expect(log.patches).toHaveLength(1);
  });
});

describe('browserTusTransport — fetch-based create/head classification', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fetchResponse(status: number, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name] ?? null },
    };
  }

  it('create: 201 + Location → ok with the resolved upload URL, sending Tus-Resumable + given headers', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(fetchResponse(201, { Location: '/tusupload/abc-123' }));
    vi.stubGlobal('fetch', fetchSpy);
    const result = await browserTusTransport().create(ENDPOINT, { ...AUTH, 'Upload-Length': '10' });
    expect(result).toEqual({ ok: true, location: UPLOAD_URL });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers['Tus-Resumable']).toBe('1.0.0');
    expect(init.headers.AuthorizationSignature).toBe('sig');
    expect(init.headers['Upload-Length']).toBe('10');
  });

  it('create: a 4xx protocol rejection (405) → unsupported (single-shot fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(405)));
    expect(await browserTusTransport().create(ENDPOINT, {})).toEqual({ ok: false, kind: 'unsupported' });
  });

  it('create: a 2xx WITHOUT Location → unsupported (no usable upload URL)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(201)));
    expect(await browserTusTransport().create(ENDPOINT, {})).toEqual({ ok: false, kind: 'unsupported' });
  });

  it('create: 413 → http 413 (too large), 5xx → network (retryable, NOT a fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(413)));
    expect(await browserTusTransport().create(ENDPOINT, {})).toEqual({ ok: false, kind: 'http', status: 413 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(503)));
    expect(await browserTusTransport().create(ENDPOINT, {})).toEqual({ ok: false, kind: 'network' });
  });

  it('create: a rejected fetch → network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await browserTusTransport().create(ENDPOINT, {})).toEqual({ ok: false, kind: 'network' });
  });

  it('head: 200 with Upload-Offset → the acked offset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(200, { 'Upload-Offset': '8388608' })));
    expect(await browserTusTransport().head(UPLOAD_URL, {})).toEqual({ ok: true, offset: 8388608 });
  });

  it('head: 200 WITHOUT a parseable Upload-Offset → network (never a fake offset 0)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(200)));
    expect(await browserTusTransport().head(UPLOAD_URL, {})).toEqual({ ok: false, kind: 'network' });
  });

  it('head: 404 → http 404 (the engine maps it to gone)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(404)));
    expect(await browserTusTransport().head(UPLOAD_URL, {})).toEqual({ ok: false, kind: 'http', status: 404 });
  });
});
