'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconLoader2,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconVideo,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { BunnyUploadInit, BunnyUploadResult } from '@/lib/bunny/upload';
import { tusUpload } from '@/lib/bunny/tus-client';

type SessionState =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'uploading'; pct: number }
  | { phase: 'done'; fileName: string }
  /** `resumable` (Stage 5): the connection died mid-upload but the video
   *  object + partial bytes still exist on Bunny — "Eseye ankò" RESUMES
   *  from the last server-acked offset instead of restarting at 0%. */
  | { phase: 'error'; message: string; resumable?: boolean };

/** The component's lifecycle phases, mirrored to the optional
 *  `onPhaseChange` callback (Stage 5) so `PlanEditor` can keep an in-flight
 *  lesson's panel mounted across accordion collapse — see that component. */
export type VideoUploadPhase = SessionState['phase'];

type View =
  | { kind: 'dropzone' }
  | { kind: 'creating' }
  | { kind: 'uploading'; pct: number }
  | { kind: 'ready'; fileName: string | null }
  | { kind: 'error'; message: string; resumable: boolean };

/**
 * Resolves what to actually show: `session` (this browser tab's own upload
 * attempt, ephemeral) always wins once it leaves 'idle'; while idle, falls
 * back to the SERVER-KNOWN state (`hasExisting`, from the `initialVideoId`
 * prop, re-read fresh every render — no effect needed to stay in sync after
 * a manual-ID commit + `router.refresh()`) unless the teacher explicitly
 * clicked "Remplacer" (`forceDropzone`), which must win over an existing
 * video so the dropzone reappears instead of the stale ready view.
 */
function resolveView(session: SessionState, hasExisting: boolean, forceDropzone: boolean): View {
  if (session.phase === 'creating') return { kind: 'creating' };
  if (session.phase === 'uploading') return { kind: 'uploading', pct: session.pct };
  if (session.phase === 'error') return { kind: 'error', message: session.message, resumable: Boolean(session.resumable) };
  if (session.phase === 'done') return { kind: 'ready', fileName: session.fileName };
  // session.phase === 'idle'
  if (forceDropzone) return { kind: 'dropzone' };
  return hasExisting ? { kind: 'ready', fileName: null } : { kind: 'dropzone' };
}

/** Generous client-side sanity cap (not a real platform limit — Bunny/infra
 *  decides the actual max) so a teacher gets an immediate, clear message
 *  instead of watching a multi-GB file crawl toward an eventual server 413. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

/** UTF-8-safe base64 (plain `btoa` mangles accented ht/fr titles). */
function toBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Auto duration (Stage 5): reads the picked file's duration CLIENT-SIDE
 * (object URL + `HTMLVideoElement` `loadedmetadata`) so lessons stop
 * shipping as 0:00 unless the teacher hand-types mm:ss. Resolves the
 * ROUNDED whole seconds, or `undefined` when the browser can't read the
 * metadata (odd codec, timeout) — NEVER rejects, and an `undefined` simply
 * leaves the manual duration field as the (pre-existing) fallback.
 */
function readVideoDurationSeconds(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return resolve(undefined);
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (duration?: number) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        video.removeAttribute('src');
        URL.revokeObjectURL(url);
        resolve(typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined);
      };
      timer = setTimeout(() => finish(undefined), 10_000);
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => finish(video.duration);
      video.onerror = () => finish(undefined);
      video.src = url;
    } catch {
      resolve(undefined);
    }
  });
}

/** Everything a paused/failed upload needs to CONTINUE without starting
 *  over: the file (bytes), the still-valid signed init payload, the TUS
 *  upload URL (once created — where the acked offset lives, server-side)
 *  and the already-started duration read. Held in a ref, not state: it must
 *  survive re-renders but never cause one. */
type ResumeContext = {
  file: File;
  init: BunnyUploadInit;
  uploadUrl: string | null;
  durationPromise: Promise<number | undefined>;
};

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * Autonomous, direct-to-Bunny video upload control. The file goes straight
 * from THIS BROWSER to Bunny's servers; this component never talks to our
 * own server for the bytes and never sees a Bunny API key — `createUpload`
 * (injected by the caller, studio vs admin CMS) already ran the
 * ownership/capability gate server-side and handed back only a short-lived,
 * single-video upload signature.
 *
 * Stage 5 — VIDEO ROBUSTNESS (this rework):
 *  1. RESUMABLE CHUNKED TUS: the old single-shot "creation-with-upload"
 *     POST (a dropped connection on a big file restarted from 0%) is now a
 *     true TUS 1.0.0 client — create, then sequential 8 MB PATCH chunks,
 *     progress from server-acked offsets, 5 backoff retries with HEAD
 *     resync — see lib/bunny/tus-client.ts. Same endpoint, same signed
 *     headers, same server-computed title metadata (it must still override
 *     the raw file name). If the endpoint rejects the chunked protocol
 *     outright, `singleShotUpload` below (the pre-Stage-5 path, kept fully
 *     functional) takes over so nothing regresses.
 *  2. AUTO DURATION: `readVideoDurationSeconds` above; `onUploaded` now
 *     also receives the rounded seconds (optional second arg — additive).
 *  3. `onPhaseChange` (optional, additive): mirrors the session phase out
 *     so `PlanEditor` can keep this panel mounted while an upload is in
 *     flight even when the lesson row is collapsed.
 *  4. A network-exhausted failure keeps its `ResumeContext`: "Eseye ankò"
 *     RESUMES from the last acked offset instead of restarting at zero.
 *
 * Task A2 (unchanged): large drag & drop dropzone with explicit states
 * (idle → envoi X % → ✓ prête); the manual-ID input + validate button live
 * behind the small "Avancé" disclosure — the admin/technical fallback path,
 * no longer competing visually with the primary flow. Reusable across BOTH
 * call sites (admin CMS + teacher studio) the exact same way it always was —
 * every Bunny-touching action (`createUpload`, `validateBunnyVideo`) is
 * still injected by the caller.
 *
 * KNOWN LIMITATION (narrow): the "Avancé" manual-id field seeds its local
 * value from `initialVideoId` once, at mount, so a guid changed by some
 * OTHER tab/session between this component's mount and now would not
 * retroactively update an already-open advanced field — acceptable for a
 * single-editor-at-a-time internal tool.
 */
export function VideoUpload({
  lessonTitle,
  initialVideoId,
  onUploaded,
  onManualIdCommit,
  createUpload,
  validateBunnyVideo,
  onPhaseChange,
}: {
  /** Used as the Bunny video's title; falls back to the file name if blank. */
  lessonTitle: string;
  /** The lesson's current `bunnyVideoId` (`''` if none) — seeds the "✓ vidéo
   *  prête" state on mount instead of an empty dropzone for a lesson that
   *  already has a video (Task A2 #5). */
  initialVideoId: string;
  /** Called with the new Bunny video guid once the drag&drop/pick upload
   *  finishes. `durationSeconds` (Stage 5, ADDITIVE — optional second arg)
   *  is the auto-detected, rounded video length, `undefined` when the
   *  browser couldn't read it; existing `(guid) => …` callers keep
   *  compiling and working unchanged. */
  onUploaded: (guid: string, durationSeconds?: number) => void;
  /** Called when the "avancé" manual-ID field is blurred with a changed,
   *  non-empty-vs-previous value — a distinct callback from `onUploaded`
   *  even though both usually end up calling the same `updateLesson`, so
   *  each path's origin (automatic upload vs manual paste) stays legible at
   *  the call site. */
  onManualIdCommit: (guid: string) => void;
  /** Injected by the caller — studio vs admin CMS pass their own
   *  ownership/capability-gated server action (createMyVideoUploadAction /
   *  createVideoUploadAction) here. Never call Bunny directly from this
   *  component. */
  createUpload: (title: string) => Promise<BunnyUploadResult>;
  /** Same shape as `LessonActions.validateBunnyVideo` — moved in here from
   *  the row that used to render this control (Task A2). */
  validateBunnyVideo: (videoId: string) => Promise<{ ok: boolean; message?: string }>;
  /** Stage 5, ADDITIVE + optional: mirrors every session-phase change
   *  (`pct` is only meaningful while `phase === 'uploading'`) so the plan
   *  editor can show a collapsed lesson's progress strip and keep the
   *  in-flight panel mounted. Omitting it changes nothing. */
  onPhaseChange?: (phase: VideoUploadPhase, pct: number) => void;
}) {
  const t = useTranslations('admin.cms.lessons');
  const [session, setSession] = useState<SessionState>({ phase: 'idle' });
  const [forceDropzone, setForceDropzone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [manualId, setManualId] = useState(initialVideoId);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<ResumeContext | null>(null);

  const view = resolveView(session, Boolean(initialVideoId), forceDropzone);

  /** Single choke point for session changes so `onPhaseChange` can never
   *  drift out of sync with what this component actually shows. */
  const update = (next: SessionState) => {
    setSession(next);
    onPhaseChange?.(next.phase, next.phase === 'uploading' ? next.pct : 0);
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      update({ phase: 'error', message: t('uploadUnsupportedFormat') });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      update({ phase: 'error', message: t('uploadTooLarge') });
      return;
    }

    // Start reading the duration NOW (parallel with the server round-trip) —
    // it's awaited only at the very end, when the upload finishes.
    const durationPromise = readVideoDurationSeconds(file);

    update({ phase: 'creating' });
    const init = await createUpload(lessonTitle.trim() || file.name);
    if (!init.ok) {
      update({ phase: 'error', message: init.message === 'not_configured' ? t('uploadNotConfigured') : t('uploadError') });
      return;
    }

    resumeRef.current = { file, init, uploadUrl: null, durationPromise };
    await runUpload();
  };

  /** The resumable chunked upload (Stage 5). Reads its inputs from
   *  `resumeRef` so "Eseye ankò" after a network-exhausted failure re-enters
   *  HERE with the same context — `existingUploadUrl` makes `tusUpload`
   *  skip creation and HEAD-resync to the last server-acked offset. */
  const runUpload = async () => {
    const ctx = resumeRef.current;
    if (!ctx) return;
    const { file, init } = ctx;
    const controller = new AbortController();
    abortRef.current = controller;
    update({ phase: 'uploading', pct: 0 });

    const outcome = await tusUpload({
      file,
      endpoint: init.tusEndpoint,
      // Bunny's TUS auth headers — a signature scoped to this one video +
      // expiry window, never the API key itself (computed server-side in
      // lib/bunny/upload.ts's createBunnyVideo). Sent on every request.
      headers: {
        AuthorizationSignature: init.signature,
        AuthorizationExpire: String(init.expire),
        VideoId: init.guid,
        LibraryId: init.libraryId,
      },
      // Bunny lets this metadata OVERWRITE the title set when the video was
      // created, so we echo the server's authoritative structured title
      // ("PA-03 · Pati 2 · <chapitre> · Leson 3 · <leçon>") — sending the raw
      // file name here would leave every video named "IMG_1234.mp4".
      metadata: `filetype ${toBase64Utf8(file.type || 'video/mp4')},title ${toBase64Utf8(init.title)}`,
      existingUploadUrl: ctx.uploadUrl,
      signal: controller.signal,
      onProgress: (sent, total) =>
        update({ phase: 'uploading', pct: total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0 }),
    });

    abortRef.current = null;
    ctx.uploadUrl = outcome.uploadUrl;

    if (outcome.ok) {
      await finishUpload(ctx);
      return;
    }
    switch (outcome.reason) {
      case 'aborted':
        resumeRef.current = null;
        update({ phase: 'idle' });
        if (inputRef.current) inputRef.current.value = '';
        return;
      case 'unsupported':
        // Endpoint rejected the chunked protocol — nothing regresses: the
        // pre-Stage-5 single-shot path takes over with the same context.
        await singleShotUpload(ctx);
        return;
      case 'too_large':
        resumeRef.current = null;
        update({ phase: 'error', message: t('uploadTooLarge') });
        return;
      case 'gone':
        // The upload resource / signature no longer exists — resuming is
        // impossible, so this is a plain (restart-from-scratch) error.
        resumeRef.current = null;
        update({ phase: 'error', message: t('uploadError') });
        return;
      case 'network_exhausted':
        // KEEP resumeRef — "Eseye ankò" re-enters runUpload() and resumes
        // from the last acked offset (the whole point of Stage 5 #1/#4).
        update({ phase: 'error', message: t('uploadConnectionLost'), resumable: true });
        return;
    }
  };

  /** FALLBACK path — Bunny's single-shot "creation with upload" POST (one
   *  request both creates the upload resource AND carries the full body),
   *  exactly what this component shipped before Stage 5. Only used when the
   *  endpoint rejects the chunked TUS protocol (`'unsupported'`); a dropped
   *  connection here restarts the file, as before. */
  const singleShotUpload = async (ctx: ResumeContext) => {
    const { file, init } = ctx;
    const controller = new AbortController();
    abortRef.current = controller;
    update({ phase: 'uploading', pct: 0 });
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', init.tusEndpoint, true);
        xhr.setRequestHeader('AuthorizationSignature', init.signature);
        xhr.setRequestHeader('AuthorizationExpire', String(init.expire));
        xhr.setRequestHeader('VideoId', init.guid);
        xhr.setRequestHeader('LibraryId', init.libraryId);
        xhr.setRequestHeader('Tus-Resumable', '1.0.0');
        xhr.setRequestHeader('Upload-Length', String(file.size));
        // Same title-override note as the chunked path above.
        xhr.setRequestHeader(
          'Upload-Metadata',
          `filetype ${toBase64Utf8(file.type || 'video/mp4')},title ${toBase64Utf8(init.title)}`,
        );
        xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');

        controller.signal.addEventListener('abort', () => xhr.abort());
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) update({ phase: 'uploading', pct: Math.round((e.loaded / e.total) * 100) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(xhr.status === 413 ? 'too_large' : `http_${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('network_error'));
        xhr.onabort = () => reject(new Error('aborted'));
        xhr.send(file);
      });
      await finishUpload(ctx);
    } catch (e) {
      resumeRef.current = null;
      if (e instanceof Error && e.message === 'aborted') {
        update({ phase: 'idle' });
        if (inputRef.current) inputRef.current.value = '';
      } else if (e instanceof Error && e.message === 'too_large') {
        update({ phase: 'error', message: t('uploadTooLarge') });
      } else {
        update({ phase: 'error', message: t('uploadError') });
      }
    } finally {
      abortRef.current = null;
    }
  };

  /** Shared success tail for both upload paths: await the (long-finished)
   *  duration read, hand BOTH values to the caller in ONE commit, then show
   *  ✓ — `onUploaded` runs before the 'done' phase-change so the caller's
   *  state settles while this panel is guaranteed still mounted. */
  const finishUpload = async (ctx: ResumeContext) => {
    const durationSeconds = await ctx.durationPromise;
    resumeRef.current = null;
    setManualId(ctx.init.guid);
    onUploaded(ctx.init.guid, durationSeconds);
    update({ phase: 'done', fileName: ctx.file.name });
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {view.kind === 'dropzone' && (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          aria-label={t('uploadDropHint')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            // Task D2 #3 — the video dropzone is the scariest control for a
            // beginner: bigger and calmer than a generic bordered box (more
            // padding, a bigger icon, room for a reassuring line under the
            // formats caption) so it reads as "a big, forgiving target",
            // not a fussy little upload widget.
            'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors motion-reduce:transition-none',
            focusRing,
            dragOver ? 'border-ochre bg-ochre/10' : 'border-ink/20 bg-paper hover:border-ink/35 hover:bg-ink/[0.02]',
          )}
        >
          <span className={cn('grid h-12 w-12 place-items-center rounded-full', dragOver ? 'bg-ochre/15' : 'bg-ink/[0.05]')}>
            <IconVideo size={26} className={dragOver ? 'text-ochre' : 'text-ink/35'} aria-hidden />
          </span>
          <p className="text-sm font-medium leading-snug text-ink">{t('uploadDropHint')}</p>
          <p className="font-mono text-[9px] uppercase tracking-wide text-ink/40">{t('uploadFormats')}</p>
          <p className="max-w-xs text-[11px] leading-snug text-ink/50">{t('uploadTakesTime')}</p>
        </div>
      )}

      {view.kind === 'creating' && (
        <div className="flex items-center gap-2 rounded-xl border border-ink/15 bg-paper px-4 py-4 font-mono text-xs text-ink/60">
          <IconLoader2 size={14} className="animate-spin" /> {t('uploadPreparing')}
        </div>
      )}

      {view.kind === 'uploading' && (
        <div className="space-y-2 rounded-xl border border-ink/15 bg-paper px-4 py-4">
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink/60">
            <span className="flex items-center gap-1.5"><IconLoader2 size={13} className="animate-spin text-ochre" aria-hidden /> {t('uploadUploading', { percent: view.pct })}</span>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className={cn('inline-flex shrink-0 items-center gap-1 text-ink/45 hover:text-stampred', focusRing)}
            >
              <IconX size={12} /> {t('uploadCancel')}
            </button>
          </div>
          <span className="block h-2.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={view.pct} aria-valuemin={0} aria-valuemax={100}>
            <span
              className="block h-full bg-ochre transition-[width] duration-150 motion-reduce:transition-none"
              style={{ width: `${view.pct}%` }}
            />
          </span>
          <p className="text-[11px] leading-snug text-ink/50">{t('uploadTakesTime')}</p>
        </div>
      )}

      {view.kind === 'ready' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3.5">
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-teal">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal/15" aria-hidden>
              <IconCheck size={14} />
            </span>
            {t('uploadReady')}
            {view.fileName ? (
              <span className="min-w-0 truncate text-ink/60">— {view.fileName}</span>
            ) : initialVideoId ? (
              <span className="truncate text-ink/45">
                — {t('uploadExistingId')}: {initialVideoId.slice(0, 8)}…
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => {
              update({ phase: 'idle' });
              setForceDropzone(true);
            }}
            aria-label={t('uploadReplace')}
            title={t('uploadReplace')}
            className={cn(
              'shrink-0 rounded border border-ink/15 px-2.5 py-1.5 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]',
              focusRing,
            )}
          >
            {t('uploadReplace')}
          </button>
        </div>
      )}

      {view.kind === 'error' && (
        <div className="space-y-1.5 rounded-xl border border-stampred/30 bg-stampred/5 px-4 py-3">
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-stampred">
            <IconAlertTriangle size={13} className="shrink-0" /> {view.message}
          </p>
          <button
            type="button"
            onClick={() => {
              // Resumable (connection died mid-upload): re-enter the chunked
              // upload with the SAME context — it HEAD-resyncs and continues
              // from the last acked offset, not from zero. Otherwise: back
              // to the dropzone for a fresh pick.
              if (view.resumable && resumeRef.current) {
                void runUpload();
              } else {
                update({ phase: 'idle' });
                setForceDropzone(true);
              }
            }}
            className={cn('font-mono text-[11px] text-ink/60 underline hover:no-underline', focusRing)}
          >
            {t('uploadRetry')}
          </button>
        </div>
      )}

      {/* Avancé — the manual Bunny ID field, an admin/technical fallback
          (how an existing guid gets pasted onto a lesson), tucked behind a
          disclosure so it never competes with the dropzone above. */}
      <div>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          className={cn(
            'inline-flex items-center gap-1 font-mono text-[10px] text-ink/45 hover:text-ink/70',
            focusRing,
          )}
        >
          {advanced ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />} {t('uploadAdvanced')}
        </button>
        {advanced && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              onBlur={() => {
                if (manualId !== initialVideoId) onManualIdCommit(manualId);
              }}
              placeholder={t('bunnyId')}
              className={cn(
                'w-48 rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-xs text-ink',
                focusRing,
              )}
            />
            <button
              type="button"
              disabled={validating}
              onClick={async () => {
                setValidating(true);
                setValidateResult(null);
                const r = await validateBunnyVideo(manualId);
                setValidating(false);
                setValidateResult(r.ok ? (r.message === 'unvalidated_mock' ? t('bunnyMock') : t('bunnyOk')) : t('bunnyBad'));
              }}
              className={cn(
                'rounded border border-ink/15 px-2 py-1 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]',
                focusRing,
              )}
            >
              {validating ? <IconLoader2 size={11} className="animate-spin" /> : t('validate')}
            </button>
            {validateResult && <span className="font-mono text-[10px] text-ink/55">{validateResult}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
