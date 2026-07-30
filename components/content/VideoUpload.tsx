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
import type { BunnyUploadResult } from '@/lib/bunny/upload';

type SessionState =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'uploading'; pct: number }
  | { phase: 'done'; fileName: string }
  | { phase: 'error'; message: string };

type View =
  | { kind: 'dropzone' }
  | { kind: 'creating' }
  | { kind: 'uploading'; pct: number }
  | { kind: 'ready'; fileName: string | null }
  | { kind: 'error'; message: string };

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
  if (session.phase === 'error') return { kind: 'error', message: session.message };
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

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * Autonomous, direct-to-Bunny video upload control (no new dependency: TUS
 * is implemented by hand with a single XHR POST — Bunny's "creation with
 * upload" extension lets one request both create the upload resource AND
 * carry the full file body, so there is no separate create+PATCH round
 * trip). The file goes straight from THIS BROWSER to Bunny's servers; this
 * component never talks to our own server for the bytes and never sees a
 * Bunny API key — `createUpload` (injected by the caller, studio vs admin
 * CMS) already ran the ownership/capability gate server-side and handed
 * back only a short-lived, single-video upload signature.
 *
 * Task A2 rework — the most-criticised part of the old editor: this is now a
 * large, obvious drag & drop dropzone with explicit states (idle → envoi X %
 * → ✓ prête), and the old "coller un ID Bunny à la main" input + validate
 * button move here too, behind a small "Avancé" disclosure — still fully
 * functional (it's the fallback path, and how an existing guid gets pasted
 * onto a lesson), just no longer competing visually with the primary
 * drag-and-drop flow. Reusable across BOTH call sites (admin CMS + teacher
 * studio) the exact same way it always was — every Bunny-touching action
 * (`createUpload`, `validateBunnyVideo`) is still injected by the caller.
 *
 * KNOWN LIMITATION (documented, acceptable for v1): this is a single-shot
 * upload, not a resumable/chunked one — if the connection drops mid-upload
 * on a large file, the teacher must re-select the file and start over
 * (Cancel does the same, via `xhr.abort()`). Real resumable chunking is a
 * v2 follow-up if large uploads over flaky connections turn out to matter.
 * A second, narrower limitation: the "Avancé" manual-id field seeds its
 * local value from `initialVideoId` once, at mount, so a guid changed by
 * some OTHER tab/session between this component's mount and now would not
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
}: {
  /** Used as the Bunny video's title; falls back to the file name if blank. */
  lessonTitle: string;
  /** The lesson's current `bunnyVideoId` (`''` if none) — seeds the "✓ vidéo
   *  prête" state on mount instead of an empty dropzone for a lesson that
   *  already has a video (Task A2 #5). */
  initialVideoId: string;
  /** Called with the new Bunny video guid once the drag&drop/pick upload
   *  finishes — UNCHANGED shape/contract from before this task. */
  onUploaded: (guid: string) => void;
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
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const view = resolveView(session, Boolean(initialVideoId), forceDropzone);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setSession({ phase: 'error', message: t('uploadUnsupportedFormat') });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setSession({ phase: 'error', message: t('uploadTooLarge') });
      return;
    }

    setSession({ phase: 'creating' });
    const init = await createUpload(lessonTitle.trim() || file.name);
    if (!init.ok) {
      setSession({ phase: 'error', message: init.message === 'not_configured' ? t('uploadNotConfigured') : t('uploadError') });
      return;
    }

    setSession({ phase: 'uploading', pct: 0 });
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('POST', init.tusEndpoint, true);
        // Bunny's TUS auth headers — a signature scoped to this one video +
        // expiry window, never the API key itself (computed server-side in
        // lib/bunny/upload.ts's createBunnyVideo).
        xhr.setRequestHeader('AuthorizationSignature', init.signature);
        xhr.setRequestHeader('AuthorizationExpire', String(init.expire));
        xhr.setRequestHeader('VideoId', init.guid);
        xhr.setRequestHeader('LibraryId', init.libraryId);
        xhr.setRequestHeader('Tus-Resumable', '1.0.0');
        xhr.setRequestHeader('Upload-Length', String(file.size));
        xhr.setRequestHeader(
          'Upload-Metadata',
          `filetype ${toBase64Utf8(file.type || 'video/mp4')},title ${toBase64Utf8(file.name)}`,
        );
        xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setSession({ phase: 'uploading', pct: Math.round((e.loaded / e.total) * 100) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(xhr.status === 413 ? 'too_large' : `http_${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('network_error'));
        xhr.onabort = () => reject(new Error('aborted'));
        xhr.send(file);
      });
      setSession({ phase: 'done', fileName: file.name });
      setManualId(init.guid);
      onUploaded(init.guid);
    } catch (e) {
      if (e instanceof Error && e.message === 'aborted') {
        setSession({ phase: 'idle' });
        if (inputRef.current) inputRef.current.value = '';
      } else if (e instanceof Error && e.message === 'too_large') {
        setSession({ phase: 'error', message: t('uploadTooLarge') });
      } else {
        setSession({ phase: 'error', message: t('uploadError') });
      }
    } finally {
      xhrRef.current = null;
    }
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
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors motion-reduce:transition-none',
            focusRing,
            dragOver ? 'border-ochre bg-ochre/10' : 'border-ink/20 bg-paper hover:border-ink/35 hover:bg-ink/[0.02]',
          )}
        >
          <IconVideo size={22} className={dragOver ? 'text-ochre' : 'text-ink/35'} aria-hidden />
          <p className="text-sm font-medium leading-snug text-ink">{t('uploadDropHint')}</p>
          <p className="font-mono text-[9px] uppercase tracking-wide text-ink/40">{t('uploadFormats')}</p>
        </div>
      )}

      {view.kind === 'creating' && (
        <div className="flex items-center gap-2 rounded-xl border border-ink/15 bg-paper px-4 py-4 font-mono text-xs text-ink/60">
          <IconLoader2 size={14} className="animate-spin" /> {t('uploadPreparing')}
        </div>
      )}

      {view.kind === 'uploading' && (
        <div className="space-y-1.5 rounded-xl border border-ink/15 bg-paper px-4 py-3">
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink/60">
            <span>{t('uploadUploading', { percent: view.pct })}</span>
            <button
              type="button"
              onClick={() => xhrRef.current?.abort()}
              className={cn('inline-flex shrink-0 items-center gap-1 text-ink/45 hover:text-stampred', focusRing)}
            >
              <IconX size={12} /> {t('uploadCancel')}
            </button>
          </div>
          <span className="block h-2 overflow-hidden rounded-full bg-ink/10">
            <span
              className="block h-full bg-ochre transition-[width] duration-150 motion-reduce:transition-none"
              style={{ width: `${view.pct}%` }}
            />
          </span>
        </div>
      )}

      {view.kind === 'ready' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3">
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-teal">
            <IconCheck size={14} className="shrink-0" aria-hidden /> {t('uploadReady')}
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
              setSession({ phase: 'idle' });
              setForceDropzone(true);
            }}
            className={cn(
              'shrink-0 rounded border border-ink/15 px-2 py-1 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]',
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
              setSession({ phase: 'idle' });
              setForceDropzone(true);
            }}
            className={cn('font-mono text-[11px] text-ink/60 underline hover:no-underline', focusRing)}
          >
            {t('uploadRetry')}
          </button>
        </div>
      )}

      {/* Avancé — the manual Bunny ID field (fallback + how an existing guid
          gets pasted onto a lesson), secondary to the dropzone above. */}
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
