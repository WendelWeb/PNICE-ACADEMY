'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconUpload, IconLoader2, IconCheck, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { BunnyUploadResult } from '@/lib/bunny/upload';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'uploading'; pct: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

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
 * KNOWN LIMITATION (documented, acceptable for v1): this is a single-shot
 * upload, not a resumable/chunked one — if the connection drops mid-upload
 * on a large file, the teacher must re-select the file and start over
 * (Cancel does the same, via `xhr.abort()`). Real resumable chunking is a
 * v2 follow-up if large uploads over flaky connections turn out to matter.
 */
export function VideoUpload({
  lessonTitle,
  onUploaded,
  createUpload,
}: {
  /** Used as the Bunny video's title; falls back to the file name if blank. */
  lessonTitle: string;
  /** Called with the new Bunny video guid once the upload finishes. */
  onUploaded: (guid: string) => void;
  /** Injected by the caller — studio vs admin CMS pass their own
   *  ownership/capability-gated server action (createMyVideoUploadAction /
   *  createVideoUploadAction) here. Never call Bunny directly from this
   *  component. */
  createUpload: (title: string) => Promise<BunnyUploadResult>;
}) {
  const t = useTranslations('admin.cms.lessons');
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Cancel-safe: abort any in-flight upload if the row unmounts (e.g. the
  // lesson is deleted, or the editor navigates away, mid-upload).
  useEffect(() => () => xhrRef.current?.abort(), []);

  const reset = () => {
    setState({ phase: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setState({ phase: 'creating' });
    const init = await createUpload(lessonTitle.trim() || file.name);
    if (!init.ok) {
      setState({ phase: 'error', message: init.message === 'not_configured' ? t('uploadNotConfigured') : t('uploadError') });
      return;
    }

    setState({ phase: 'uploading', pct: 0 });
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
          if (e.lengthComputable) setState({ phase: 'uploading', pct: Math.round((e.loaded / e.total) * 100) });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`http_${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('network_error'));
        xhr.onabort = () => reject(new Error('aborted'));
        xhr.send(file);
      });
      setState({ phase: 'done' });
      onUploaded(init.guid);
    } catch (e) {
      if (e instanceof Error && e.message === 'aborted') {
        reset();
      } else {
        setState({ phase: 'error', message: t('uploadError') });
      }
    } finally {
      xhrRef.current = null;
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
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
      {state.phase === 'idle' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'inline-flex items-center gap-1 rounded border border-ink/15 px-2 py-1 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]',
            focusRing,
          )}
        >
          <IconUpload size={11} /> {t('uploadChooseFile')}
        </button>
      )}

      {state.phase === 'creating' && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-ink/55">
          <IconLoader2 size={11} className="animate-spin" /> {t('uploadPreparing')}
        </span>
      )}

      {state.phase === 'uploading' && (
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-ink/60">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10">
            <span
              className="block h-full bg-ochre transition-[width] duration-150"
              style={{ width: `${state.pct}%` }}
            />
          </span>
          {t('uploadUploading', { percent: state.pct })}
          <button
            type="button"
            onClick={() => xhrRef.current?.abort()}
            aria-label={t('uploadCancel')}
            className={cn('text-ink/40 hover:text-stampred', focusRing)}
          >
            <IconX size={11} />
          </button>
        </span>
      )}

      {state.phase === 'done' && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-teal">
          <IconCheck size={11} /> {t('uploadUploaded')}
        </span>
      )}

      {state.phase === 'error' && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-stampred">
          <IconAlertTriangle size={11} /> {state.message}
          <button type="button" onClick={reset} className={cn('underline hover:no-underline', focusRing)}>
            {t('uploadRetry')}
          </button>
        </span>
      )}
    </span>
  );
}
