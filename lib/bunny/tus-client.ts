/**
 * lib/bunny/tus-client.ts — a hand-rolled, dependency-free TUS 1.0.0 client
 * (Stage 5 — video robustness) for the browser side of the direct-to-Bunny
 * video upload. Replaces the old single-shot "creation-with-upload" POST in
 * components/content/VideoUpload.tsx: a dropped connection on a
 * multi-hundred-MB file over a flaky (Haitian mobile) connection used to
 * restart from 0%; this uploads in sequential 8 MB PATCH chunks so only the
 * in-flight chunk is ever lost, retries transient failures with exponential
 * backoff, and resynchronizes the server-acked offset via HEAD before every
 * retry — the true TUS core protocol, against the SAME Bunny endpoint and
 * the SAME signed headers the single-shot path used (nothing changes
 * server-side; see lib/bunny/upload.ts).
 *
 * NEVER THROWS (project-wide contract): `tusUpload` resolves a discriminated
 * `TusUploadOutcome` for every failure mode — including `'unsupported'`,
 * which tells the caller to fall back to the still-shipping single-shot
 * path so nothing regresses if the endpoint rejects the chunked protocol.
 *
 * BROWSER-ONLY at runtime (XHR/fetch), but deliberately free of imports and
 * of any module-level DOM access so the RETRY/RESYNC ENGINE is unit-testable
 * in node with an injected `transport` + `sleep` (see tus-client.test.ts) —
 * the same DI style the rest of the plan editor uses for server actions.
 */

/** 8 MB — small enough that a dropped connection wastes at most one chunk
 *  on a slow link, large enough to keep per-chunk HTTP overhead negligible
 *  on a multi-hundred-MB course video. */
export const TUS_CHUNK_BYTES = 8 * 1024 * 1024;
/** "Retry up to 5 times" — 5 retries AFTER a failed request (6 tries per
 *  stretch); the counter resets after every successfully acked chunk so a
 *  long upload on a blinking connection isn't capped at 5 hiccups total. */
export const TUS_MAX_RETRIES = 5;
export const TUS_PROTOCOL_VERSION = '1.0.0';

/** Exponential backoff for retry N (1-based): 1s, 2s, 4s, 8s, 16s — capped
 *  at 30s so a caller passing a larger retry budget can't sleep forever. */
export function tusBackoffMs(retry: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, retry - 1));
}

/** Strict `Upload-Offset` header parse. `Number(null)`/`Number('')` are 0 in
 *  JS — silently treating a MISSING header as offset 0 would rewind a
 *  half-done upload to the start, so anything but a pure digit string is
 *  `null` (caller decides how to degrade). */
export function parseTusOffset(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** Resolves the creation response's `Location` (absolute OR relative, both
 *  legal per RFC 7231) against the TUS endpoint; `null` for garbage — the
 *  transport maps that to `'unsupported'` (no usable upload URL). */
export function resolveTusUploadUrl(endpoint: string, location: string): string | null {
  try {
    return new URL(location, endpoint).toString();
  } catch {
    return null;
  }
}

export type TusCreateResult =
  | { ok: true; location: string }
  | { ok: false; kind: 'network' }
  /** The endpoint answered but not with a usable TUS creation (bad status,
   *  no Location) — the caller falls back to the single-shot upload path. */
  | { ok: false; kind: 'unsupported' }
  | { ok: false; kind: 'http'; status: number };

export type TusPatchResult =
  | { ok: true; offset: number }
  | { ok: false; kind: 'network' }
  | { ok: false; kind: 'aborted' }
  | { ok: false; kind: 'http'; status: number };

export type TusHeadResult =
  | { ok: true; offset: number }
  | { ok: false; kind: 'network' }
  | { ok: false; kind: 'http'; status: number };

/** The three raw HTTP moves of the TUS core protocol, injectable for tests
 *  (and swappable if Bunny ever needs a bespoke quirk in one of them). */
export type TusTransport = {
  create(endpoint: string, headers: Record<string, string>): Promise<TusCreateResult>;
  patch(
    url: string,
    headers: Record<string, string>,
    chunk: Blob,
    onChunkProgress: (sentBytes: number) => void,
    signal?: AbortSignal,
  ): Promise<TusPatchResult>;
  head(url: string, headers: Record<string, string>): Promise<TusHeadResult>;
};

export type TusUploadOutcome =
  | { ok: true; uploadUrl: string }
  | {
      ok: false;
      reason:
        /** Endpoint rejected the chunked protocol — fall back to single-shot. */
        | 'unsupported'
        /** Caller aborted (cancel button) — clean stop, nothing to surface. */
        | 'aborted'
        /** Server said the file is too big (413). */
        | 'too_large'
        /** The upload resource no longer exists / signature no longer valid
         *  (403/404/410) — resuming is impossible, restart from scratch. */
        | 'gone'
        /** Out of retries — the `uploadUrl` (when non-null) lets the caller
         *  RESUME from the last acked offset instead of restarting at 0. */
        | 'network_exhausted';
      uploadUrl: string | null;
    };

export type TusUploadOptions = {
  file: Blob;
  endpoint: string;
  /** The signed Bunny auth headers (AuthorizationSignature / Expire /
   *  VideoId / LibraryId) — sent on EVERY request (create, patch, head),
   *  matching how Bunny's own tus-js-client example wires them. */
  headers: Record<string, string>;
  /** The full `Upload-Metadata` value (filetype + server-computed title),
   *  prebuilt by the caller — sent on creation only. */
  metadata: string;
  /** Resume support: a previous attempt's upload URL. When set, creation is
   *  skipped and the offset is resynchronized via HEAD first. */
  existingUploadUrl?: string | null;
  signal?: AbortSignal;
  /** Called with (ackedOrInFlightBytes, totalBytes) — monotonic per chunk,
   *  but may step BACK after a retry resync (honest, not cosmetic). */
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  chunkBytes?: number;
  maxRetries?: number;
  transport?: TusTransport;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

/** 413 kills the upload as "too large"; 403/404/410 mean the upload resource
 *  (or its time-boxed signature) is gone — resume is impossible, so fail
 *  fast and let the caller restart cleanly. Everything else (409 offset
 *  conflict, 5xx, timeouts) is worth a resynced retry. */
function fatalFromStatus(status: number): 'too_large' | 'gone' | null {
  if (status === 413) return 'too_large';
  if (status === 403 || status === 404 || status === 410) return 'gone';
  return null;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}

/** The real (browser) transport — fetch for create/head (no progress needed),
 *  XHR for chunk PATCHes (fetch has no upload-progress events). */
export function browserTusTransport(): TusTransport {
  return {
    async create(endpoint, headers) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Tus-Resumable': TUS_PROTOCOL_VERSION, ...headers },
        });
        if (!res.ok) {
          if (res.status === 413) return { ok: false, kind: 'http', status: 413 };
          // 5xx: Bunny/a proxy is having a moment — retryable, NOT a
          // protocol rejection (falling back to single-shot would fail the
          // same way). Any other 4xx (405, 412, 404…) means the endpoint
          // rejects the chunked protocol outright → single-shot fallback.
          if (res.status >= 500) return { ok: false, kind: 'network' };
          return { ok: false, kind: 'unsupported' };
        }
        const location = res.headers.get('Location');
        const url = location ? resolveTusUploadUrl(endpoint, location) : null;
        if (!url) return { ok: false, kind: 'unsupported' };
        return { ok: true, location: url };
      } catch {
        return { ok: false, kind: 'network' };
      }
    },

    patch(url, headers, chunk, onChunkProgress, signal) {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PATCH', url, true);
        xhr.setRequestHeader('Tus-Resumable', TUS_PROTOCOL_VERSION);
        xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        const onAbort = () => xhr.abort();
        signal?.addEventListener('abort', onAbort);
        const done = (result: TusPatchResult) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(result);
        };
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onChunkProgress(e.loaded);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const acked = parseTusOffset(xhr.getResponseHeader('Upload-Offset'));
            // Missing/garbled header on a 2xx: fall back to assuming the
            // whole chunk landed (the base offset is in the request headers).
            const base = parseTusOffset(headers['Upload-Offset']) ?? 0;
            done({ ok: true, offset: acked ?? base + chunk.size });
          } else {
            done({ ok: false, kind: 'http', status: xhr.status });
          }
        };
        xhr.onerror = () => done({ ok: false, kind: 'network' });
        xhr.ontimeout = () => done({ ok: false, kind: 'network' });
        xhr.onabort = () => done({ ok: false, kind: 'aborted' });
        xhr.send(chunk);
      });
    },

    async head(url, headers) {
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          headers: { 'Tus-Resumable': TUS_PROTOCOL_VERSION, ...headers },
        });
        if (!res.ok) return { ok: false, kind: 'http', status: res.status };
        const offset = parseTusOffset(res.headers.get('Upload-Offset'));
        // A 2xx HEAD without a parseable Upload-Offset is useless for
        // resync — treat like a network blip (retry keeps the last known
        // offset) rather than trusting a fake 0.
        if (offset === null) return { ok: false, kind: 'network' };
        return { ok: true, offset };
      } catch {
        return { ok: false, kind: 'network' };
      }
    },
  };
}

/**
 * The upload engine — TUS 1.0.0 core protocol:
 *
 *  1. CREATE (`POST` endpoint, `Upload-Length` + `Upload-Metadata` + signed
 *     headers, empty body) → upload URL from `Location`. Skipped when
 *     resuming (`existingUploadUrl`), which HEAD-resyncs the offset instead.
 *  2. Sequential `PATCH` chunks (`chunkBytes`, default 8 MB) at the current
 *     offset; the SERVER-ACKED `Upload-Offset` response header is
 *     authoritative for where the next chunk starts.
 *  3. On a retryable failure: exponential backoff (1s → 16s), then HEAD to
 *     resynchronize the offset before retrying — never blind-resend. Up to
 *     `maxRetries` consecutive failures; the counter resets on every acked
 *     chunk. Exhaustion returns the upload URL so the caller can offer a
 *     "resume from where it stopped" retry.
 *
 * Resolves, never rejects. Cancellation via `signal` resolves `'aborted'`.
 */
export async function tusUpload(options: TusUploadOptions): Promise<TusUploadOutcome> {
  const {
    file,
    endpoint,
    headers,
    metadata,
    existingUploadUrl = null,
    signal,
    onProgress,
    chunkBytes = TUS_CHUNK_BYTES,
    maxRetries = TUS_MAX_RETRIES,
    transport = browserTusTransport(),
    sleep = abortableSleep,
  } = options;

  const size = file.size;
  const abortedOutcome = (uploadUrl: string | null): TusUploadOutcome => ({ ok: false, reason: 'aborted', uploadUrl });

  let uploadUrl = existingUploadUrl;
  let offset = 0;
  let failures = 0;

  if (!uploadUrl) {
    // Phase 1a — create the upload resource.
    for (;;) {
      if (signal?.aborted) return abortedOutcome(null);
      const created = await transport.create(endpoint, {
        ...headers,
        'Upload-Length': String(size),
        'Upload-Metadata': metadata,
      });
      if (created.ok) {
        uploadUrl = created.location;
        break;
      }
      if (created.kind === 'unsupported') return { ok: false, reason: 'unsupported', uploadUrl: null };
      if (created.kind === 'http') {
        return created.status === 413
          ? { ok: false, reason: 'too_large', uploadUrl: null }
          : { ok: false, reason: 'unsupported', uploadUrl: null };
      }
      failures += 1;
      if (failures > maxRetries) return { ok: false, reason: 'network_exhausted', uploadUrl: null };
      await sleep(tusBackoffMs(failures), signal);
    }
  } else {
    // Phase 1b — resuming: ask the server how much it already has.
    for (;;) {
      if (signal?.aborted) return abortedOutcome(uploadUrl);
      const head = await transport.head(uploadUrl, headers);
      if (head.ok) {
        offset = Math.min(head.offset, size);
        break;
      }
      if (head.kind === 'http') {
        const fatal = fatalFromStatus(head.status);
        if (fatal) return { ok: false, reason: fatal, uploadUrl };
      }
      failures += 1;
      if (failures > maxRetries) return { ok: false, reason: 'network_exhausted', uploadUrl };
      await sleep(tusBackoffMs(failures), signal);
    }
  }

  failures = 0;
  onProgress?.(offset, size);

  // Phase 2 — sequential chunk PATCHes.
  while (offset < size) {
    if (signal?.aborted) return abortedOutcome(uploadUrl);
    const base = offset;
    const chunk = file.slice(base, Math.min(base + chunkBytes, size));
    const res = await transport.patch(
      uploadUrl,
      { ...headers, 'Upload-Offset': String(base) },
      chunk,
      (sentBytes) => onProgress?.(Math.min(base + sentBytes, size), size),
      signal,
    );

    if (res.ok) {
      offset = Math.min(Math.max(res.offset, 0), size);
      failures = 0;
      onProgress?.(offset, size);
      continue;
    }
    if (res.kind === 'aborted') return abortedOutcome(uploadUrl);
    if (res.kind === 'http') {
      const fatal = fatalFromStatus(res.status);
      if (fatal) return { ok: false, reason: fatal, uploadUrl };
    }

    failures += 1;
    if (failures > maxRetries) return { ok: false, reason: 'network_exhausted', uploadUrl };
    await sleep(tusBackoffMs(failures), signal);
    if (signal?.aborted) return abortedOutcome(uploadUrl);

    // Resynchronize with the server-acked offset before retrying. A HEAD
    // network failure keeps the current offset — if it's stale the next
    // PATCH answers 409 and lands right back in this retry path.
    const head = await transport.head(uploadUrl, headers);
    if (head.ok) {
      offset = Math.min(head.offset, size);
      onProgress?.(offset, size);
    } else if (head.kind === 'http') {
      const fatal = fatalFromStatus(head.status);
      if (fatal) return { ok: false, reason: fatal, uploadUrl };
    }
  }

  return { ok: true, uploadUrl };
}
