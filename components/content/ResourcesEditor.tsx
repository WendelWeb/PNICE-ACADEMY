'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconLink,
  IconFile,
  IconFileUpload,
  IconLoader2,
  IconX,
  IconCircleCheck,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { isValidHttpUrl, normalizeHttpUrlInput } from '@/lib/teacher/apply-validation';
import { ASSET_MAX_BYTES } from '@/lib/uploads/course-asset';
import { MONO_LOCALE_NAME } from '@/components/admin/content/fields';
import { postCourseAsset } from './courseAssetUpload';
import type { CourseResource } from '@/db/schema';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink ' + focusRing;

const KNOWN_ERRORS = [
  'resource_label_ht_required',
  'resource_label_fr_required',
  'resource_label_ht_too_long',
  'resource_label_fr_too_long',
  'resource_kind_invalid',
  'resource_url_invalid',
] as const;

/** The document types the upload route accepts for `purpose: 'resource'` —
 *  mirrors lib/uploads/course-asset.ts's `ASSET_ALLOWED_MIME.resource`. */
const RESOURCE_EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
};
const RESOURCE_ACCEPT = Object.keys(RESOURCE_EXT_MIME)
  .map((ext) => `.${ext}`)
  .concat(Object.values(RESOURCE_EXT_MIME))
  .join(',');

function fileExtension(name: string): string | null {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : null;
}

/** 'gid-elev-yo.pdf' → 'gid elev yo' — the prefilled, renamable row title
 *  (no extension, dashes/underscores → spaces). Exported for unit reuse. */
export function fileNameToLabel(name: string, fallback: string): string {
  const base = name.replace(/\.[a-z0-9]{1,8}$/i, '');
  const cleaned = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

/**
 * Forgiving URL entry (Stage 4 #3): a teacher pasting "youtube.com/watch?v=x"
 * from memory shouldn't be told their link is broken over a missing scheme —
 * on blur, a value that looks like a bare domain (letters/digits/dashes with
 * at least one dot, optionally followed by a path) gets 'https://' prepended.
 * Anything already carrying a scheme, or not domain-shaped at all, is
 * returned untouched (and the normal client-side validity check judges it).
 * The logic itself now lives in `lib/teacher/apply-validation.ts`
 * (`normalizeHttpUrlInput`) so the image write actions apply the SAME
 * forgiveness server-side; this export stays for existing importers.
 */
export function normalizeUrlInput(value: string): string {
  return normalizeHttpUrlInput(value);
}

type UploadPhase = { phase: 'idle' } | { phase: 'uploading'; pct: number } | { phase: 'error'; message: string };

/**
 * A links/documents editor (Task K2, rebuilt end-to-end by Stage 4 —
 * documents/ressources): list of `{ label_ht, label_fr, url, kind }` rows
 * (`db/schema.ts`'s `CourseResource` — shape UNCHANGED) with add/remove,
 * PLUS a real document dropzone. Reused verbatim for BOTH a lesson's
 * `resources` (components/admin/content/plan/LessonEditPanel.tsx) and a
 * course's (components/admin/content/CourseResourcesPanel.tsx).
 *
 * What Stage 4 changed (audit findings):
 *  - REAL file upload: 'Trennen dokiman an isit la…' dropzone → POST
 *    /api/upload/course-asset (`purpose: 'resource'`, ≤ 4 MB, pdf/office/
 *    zip/txt) → on success a `{ kind: 'file' }` row is auto-appended with a
 *    renamable title prefilled from the cleaned file name, and `onUploaded`
 *    lets the caller AUTO-SAVE it immediately (it already round-tripped the
 *    server). Progress/✓/error states cloned from VideoUpload; a
 *    `not_configured` answer (or `uploadEnabled={false}` from the server)
 *    degrades to ONE calm sentence + the link path — zero jargon, nothing
 *    broken.
 *  - the kind <select> is GONE: kind is inferred — uploaded → 'file',
 *    pasted → 'link' (a '.pdf' link simply gets the file icon).
 *  - `mono` (same convention as fields.tsx's `BilingualText`): a monolingual
 *    course shows ONE 'Tit lyen an' input per row; the server mirrors the
 *    label into the hidden locale on save (lib/courses/write.ts's
 *    `prepareResourcesForWrite`).
 *  - `audienceNote` is a PROP: course-level and lesson-level resources have
 *    different, truthful audiences (public sales page vs enrolled students),
 *    so the note is the caller's to state — the old shared, contradictory
 *    copy is gone.
 *
 * STILL DUMB/CONTROLLED for every edit: `onChange` receives the next full
 * array immediately, the callers own the save. The one addition is
 * `onUploaded`, fired after an upload appends its row, so callers can
 * commit that row right away.
 */
export function ResourcesEditor({
  resources,
  onChange,
  serverError,
  label,
  slug,
  mono,
  uploadEnabled = true,
  audienceNote,
  onUploaded,
}: {
  resources: CourseResource[];
  onChange: (next: CourseResource[]) => void;
  serverError?: string | null;
  /** Overrides the default "Resous"/"Ressources" heading — `""` skips it
   *  (both current callers render their own heading). */
  label?: string;
  /** Course slug, required by the document dropzone's upload POST — when
   *  omitted, only the link path renders (defensive: no caller omits it). */
  slug?: string;
  /** fields.tsx `BilingualText` mono convention: `undefined` = bilingual
   *  (two label inputs), `'ht'`/`'fr'` = ONE label input for that locale. */
  mono?: 'ht' | 'fr';
  /** Server-known "is the document upload rail configured?"
   *  (`bunnyStorageConfigured()`): `false` renders the calm link-first
   *  fallback immediately; a runtime `not_configured` flips the same switch. */
  uploadEnabled?: boolean;
  /** Truthful "who sees these" line, stated BY THE CALLER — public sales
   *  page at course level, enrolled students at lesson level. */
  audienceNote?: string;
  /** Called with the full next list right after an uploaded document's row
   *  is appended (and after `onChange`) — callers auto-save immediately. */
  onUploaded?: (next: CourseResource[]) => void;
}) {
  const t = useTranslations('admin.cms.resources');
  const heading = label ?? t('title');

  const [upload, setUpload] = useState<UploadPhase>({ phase: 'idle' });
  const [justUploaded, setJustUploaded] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(!uploadEnabled);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  // Latest list for the async upload-completion append — the teacher may
  // have edited other rows while the file was travelling.
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;

  const setRow = (i: number, patch: Partial<CourseResource>) =>
    onChange(resources.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...resources, { label_ht: '', label_fr: '', url: '', kind: 'link' }]);
  const remove = (i: number) => onChange(resources.filter((_, k) => k !== i));

  const errorText = serverError
    ? t((KNOWN_ERRORS as readonly string[]).includes(serverError) ? `errors.${serverError}` : 'errors.generic')
    : null;

  const handleFile = async (file: File) => {
    if (!slug) return;
    setJustUploaded(null);

    // Plain-language refusals BEFORE any network (ImagesManager's approach):
    // wrong document type, or over the resource cap (4 MB — the honest
    // ceiling under Vercel's serverless request-body limit, see
    // lib/uploads/course-asset.ts's ASSET_MAX_BYTES).
    const ext = fileExtension(file.name);
    if (!ext || !RESOURCE_EXT_MIME[ext]) {
      setUpload({ phase: 'error', message: t('errorType') });
      return;
    }
    if (file.size > ASSET_MAX_BYTES.resource) {
      setUpload({ phase: 'error', message: t('errorTooLarge') });
      return;
    }
    // Some phone pickers declare no MIME at all — infer it from the (already
    // whitelisted) extension so the server's MIME gate judges real content
    // instead of refusing an empty string. The server still magic-byte
    // checks; this is convenience, not trust.
    const toSend = file.type ? file : new File([file], file.name, { type: RESOURCE_EXT_MIME[ext] });

    setUpload({ phase: 'uploading', pct: 0 });
    const form = new FormData();
    form.append('file', toSend);
    form.append('slug', slug);
    form.append('purpose', 'resource');
    const res = await postCourseAsset(form, (pct) => setUpload({ phase: 'uploading', pct }), xhrRef);
    xhrRef.current = null;
    if (inputRef.current) inputRef.current.value = '';

    if (!res.ok) {
      if (res.message === 'aborted') setUpload({ phase: 'idle' });
      else if (res.message === 'not_configured') {
        // Calm degradation, not an error: flip to the link-first fallback.
        setNotConfigured(true);
        setUpload({ phase: 'idle' });
      } else if (res.message === 'too_large') setUpload({ phase: 'error', message: t('errorTooLarge') });
      else if (res.message === 'unsupported_type' || res.message === 'content_mismatch' || res.message === 'empty_file') {
        setUpload({ phase: 'error', message: t('errorType') });
      } else setUpload({ phase: 'error', message: t('errorUpload') });
      return;
    }

    // Auto-append the uploaded document as a renamable row — BOTH labels are
    // prefilled from the cleaned file name (a bilingual course's strict
    // validation passes, and the teacher can then adjust either side; a
    // monolingual course only shows — and the server only keeps — the
    // primary one anyway, via `prepareResourcesForWrite`'s mirror).
    const rowLabel = fileNameToLabel(file.name, t('fileFallback'));
    const next: CourseResource[] = [
      ...resourcesRef.current,
      { label_ht: rowLabel, label_fr: rowLabel, url: res.url, kind: 'file' },
    ];
    setUpload({ phase: 'idle' });
    setJustUploaded(rowLabel);
    onChange(next);
    onUploaded?.(next);
  };

  const openPicker = () => inputRef.current?.click();
  const showDropzone = Boolean(slug) && !notConfigured;

  return (
    <div>
      {/* `label=""` (Task A2 — both callers already render their own heading)
          deliberately skips this span rather than rendering an empty,
          still-margined line. */}
      {heading && <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{heading}</span>}

      {resources.length === 0 && (
        <p className="flex items-center gap-1.5 font-mono text-[11px] leading-snug text-graphite/50">
          <IconLink size={13} className="shrink-0 text-ink/30" aria-hidden /> {t('empty')}
        </p>
      )}

      <ul className="space-y-1.5">
        {resources.map((r, i) => {
          const isFile = r.kind === 'file';
          const urlOk = isFile || r.url.trim() === '' || isValidHttpUrl(r.url);
          // Kind is inferred, never chosen (Stage 4 #2): uploaded rows are
          // 'file'; pasted rows stay 'link' — but a pasted '.pdf' link still
          // gets the file icon so the list reads truthfully.
          const KindIcon = isFile || /\.pdf($|[?#])/i.test(r.url.trim()) ? IconFile : IconLink;
          const fileExt = isFile ? fileExtension(r.url.split(/[?#]/)[0]) : null;
          return (
            <li key={i} className="space-y-1.5 rounded-lg border border-ink/10 bg-paper p-2">
              {mono ? (
                <input
                  value={mono === 'ht' ? r.label_ht : r.label_fr}
                  onChange={(e) => setRow(i, mono === 'ht' ? { label_ht: e.target.value } : { label_fr: e.target.value })}
                  placeholder={t('label')}
                  aria-label={`${t('label')} · ${MONO_LOCALE_NAME[mono]}`}
                  className={inputCls}
                />
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <input
                    value={r.label_ht}
                    onChange={(e) => setRow(i, { label_ht: e.target.value })}
                    placeholder={t('labelHt')}
                    aria-label={t('labelHt')}
                    className={inputCls}
                  />
                  <input
                    value={r.label_fr}
                    onChange={(e) => setRow(i, { label_fr: e.target.value })}
                    placeholder={t('labelFr')}
                    aria-label={t('labelFr')}
                    className={inputCls}
                  />
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-ink/10 bg-paper-light text-ink/45" aria-hidden>
                  <KindIcon size={14} />
                </span>
                {isFile ? (
                  // An uploaded document: its address is ours (it round-
                  // tripped the server) — nothing to type, nothing technical
                  // to show. A plain "Dokiman · PDF" chip + the trash.
                  <span className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-ink/10 bg-paper-light px-2.5 py-1.5 font-mono text-[11px] text-ink/55">
                    <span className="truncate">{t('fileChip')}</span>
                    {fileExt && <span className="shrink-0 uppercase text-ink/40">· {fileExt}</span>}
                  </span>
                ) : (
                  <input
                    value={r.url}
                    onChange={(e) => setRow(i, { url: e.target.value })}
                    onBlur={() => {
                      const fixed = normalizeUrlInput(r.url);
                      if (fixed !== r.url) setRow(i, { url: fixed });
                    }}
                    placeholder={t('urlPlaceholderLink')}
                    aria-label={t('urlAria')}
                    inputMode="url"
                    className={cn(inputCls, 'flex-1', !urlOk && 'border-stampred/60')}
                  />
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={t('remove')}
                  title={t('remove')}
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded border border-ink/15 text-stampred hover:bg-ink/[0.04]',
                    focusRing,
                  )}
                >
                  <IconTrash size={13} />
                </button>
              </div>
              {!urlOk && (
                <p className="flex items-center gap-1 font-mono text-[10px] text-stampred">
                  <IconAlertTriangle size={11} /> {t('urlInvalid')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* The document dropzone (Stage 4 #1) — same explicit state machine as
          VideoUpload/ImagesManager: idle → envoi X % (cancellable) →
          ✓ / error + retry. Phone-first: tapping opens the file picker. */}
      {showDropzone && (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept={RESOURCE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />

          {upload.phase === 'idle' && (
            <div
              role="button"
              tabIndex={0}
              onClick={openPicker}
              aria-label={t('dropHint')}
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
              <span className={cn('grid h-10 w-10 place-items-center rounded-full', dragOver ? 'bg-ochre/15' : 'bg-ink/[0.05]')}>
                <IconFileUpload size={22} className={dragOver ? 'text-ochre' : 'text-ink/35'} aria-hidden />
              </span>
              <p className="text-sm font-medium leading-snug text-ink">{t('dropHint')}</p>
              <p className="max-w-xs text-[11px] leading-snug text-ink/50">{t('dropTap')}</p>
              <p className="font-mono text-[9px] uppercase tracking-wide text-ink/40">{t('dropFormats')}</p>
            </div>
          )}

          {upload.phase === 'uploading' && (
            <div className="space-y-2 rounded-xl border border-ink/15 bg-paper px-4 py-4">
              <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink/60">
                <span className="flex items-center gap-1.5">
                  <IconLoader2 size={13} className="animate-spin text-ochre" aria-hidden /> {t('uploading', { percent: upload.pct })}
                </span>
                <button
                  type="button"
                  onClick={() => xhrRef.current?.abort()}
                  className={cn('inline-flex shrink-0 items-center gap-1 text-ink/45 hover:text-stampred', focusRing)}
                >
                  <IconX size={12} /> {t('uploadCancel')}
                </button>
              </div>
              <span className="block h-2.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={upload.pct} aria-valuemin={0} aria-valuemax={100}>
                <span
                  className="block h-full bg-ochre transition-[width] duration-150 motion-reduce:transition-none"
                  style={{ width: `${upload.pct}%` }}
                />
              </span>
            </div>
          )}

          {upload.phase === 'error' && (
            <div className="space-y-1.5 rounded-xl border border-stampred/30 bg-stampred/5 px-4 py-3">
              <p className="flex items-center gap-1.5 font-mono text-[11px] text-stampred">
                <IconAlertTriangle size={13} className="shrink-0" /> {upload.message}
              </p>
              <button
                type="button"
                onClick={() => setUpload({ phase: 'idle' })}
                className={cn('font-mono text-[11px] text-ink/60 underline hover:no-underline', focusRing)}
              >
                {t('uploadRetry')}
              </button>
            </div>
          )}

          {justUploaded && upload.phase === 'idle' && (
            <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-teal" role="status">
              <IconCircleCheck size={14} aria-hidden /> {t('uploaded')} — {justUploaded}
            </p>
          )}
        </div>
      )}

      {/* not_configured degradation (Stage 4 #1): one calm sentence, the
          link path below stays the primary path — no dev jargon. */}
      {Boolean(slug) && notConfigured && (
        <p className="mt-2 text-[11px] leading-snug text-ink/60">{t('notConfigured')}</p>
      )}

      <button
        type="button"
        onClick={add}
        className={cn('mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline', focusRing)}
      >
        <IconPlus size={12} /> {t('add')}
      </button>

      {/* Truthful audience note (Stage 4 #6) — the caller states who really
          sees these; no shared note that's wrong for one of the two levels. */}
      {audienceNote && resources.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-snug text-ink/45">{audienceNote}</p>
      )}

      {errorText && (
        <p className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-stampred">
          <IconAlertTriangle size={11} /> {errorText}
        </p>
      )}
    </div>
  );
}
