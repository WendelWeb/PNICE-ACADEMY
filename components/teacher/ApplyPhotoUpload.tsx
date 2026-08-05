'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconLoader2, IconPhoto, IconTrash, IconX, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { IMAGE_SOURCE_MAX_BYTES, uploadBlobName } from '@/lib/uploads/image-prep';
import { resizeImageFile } from '@/lib/uploads/resize-client';
import { postCourseAsset } from '@/components/content/courseAssetUpload';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'preparing' }
  | { phase: 'uploading'; pct: number }
  | { phase: 'error'; message: string };

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * The apply wizard's profile-photo field (Stage 7 — replaces the old
 * paste-a-URL-only field). Same upload rail shape as
 * `components/admin/content/ImagesManager.tsx`'s dropzone (client-side
 * resize via `resizeImageFile`, XHR progress via `postCourseAsset`), posting
 * with `purpose: 'profile'` (app/api/upload/course-asset/route.ts's
 * user-scoped arm — no course exists yet at apply time).
 *
 * ENV-GATED DEGRADATION: `uploadEnabled=false` (no Bunny Storage configured)
 * renders ONLY the plain URL field — no dead dropzone. When upload IS
 * enabled, the URL field survives as an "Avanse" fallback (kole yon lyen
 * pito) — the exact same two-tier shape ImagesManager uses.
 */
export function ApplyPhotoUpload({
  value,
  onChange,
  uploadEnabled,
}: {
  value: string;
  onChange: (url: string) => void;
  uploadEnabled: boolean;
}) {
  const t = useTranslations('teach.apply.profile');
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const [justUploaded, setJustUploaded] = useState(false);
  const [showUrlField, setShowUrlField] = useState(!uploadEnabled);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const busy = upload.phase === 'preparing' || upload.phase === 'uploading';

  const handleFile = async (file: File) => {
    setJustUploaded(false);
    if (file.type && !file.type.startsWith('image/')) {
      setUpload({ phase: 'error', message: t('photoUpload.errorNotImage') });
      return;
    }
    if (file.size > IMAGE_SOURCE_MAX_BYTES) {
      setUpload({ phase: 'error', message: t('photoUpload.errorTooLarge') });
      return;
    }

    setUpload({ phase: 'preparing' });
    const blob = await resizeImageFile(file);
    if (!blob) {
      setUpload({ phase: 'error', message: t('photoUpload.errorNotImage') });
      return;
    }

    setUpload({ phase: 'uploading', pct: 0 });
    const form = new FormData();
    form.append('file', blob, uploadBlobName(file.name, blob.type));
    form.append('purpose', 'profile');
    const res = await postCourseAsset(form, (pct) => setUpload({ phase: 'uploading', pct }), xhrRef);
    xhrRef.current = null;
    if (inputRef.current) inputRef.current.value = '';

    if (!res.ok) {
      if (res.message === 'aborted') setUpload({ phase: 'idle' });
      else if (res.message === 'not_configured') setShowUrlField(true);
      else if (res.message === 'too_large') setUpload({ phase: 'error', message: t('photoUpload.errorTooLarge') });
      else if (res.message === 'unsupported_type' || res.message === 'content_mismatch') {
        setUpload({ phase: 'error', message: t('photoUpload.errorNotImage') });
      } else setUpload({ phase: 'error', message: t('photoUpload.errorUpload') });
      return;
    }

    onChange(res.url);
    setUpload({ phase: 'idle' });
    setJustUploaded(true);
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div>
      <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {t('photoUpload.label')}
      </label>

      {value.trim() && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-ink/10 bg-paper p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.trim()} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          <button
            type="button"
            onClick={() => {
              onChange('');
              setJustUploaded(false);
            }}
            className={cn('ml-auto inline-flex items-center gap-1 rounded border border-stampred/30 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/10', focusRing)}
          >
            <IconTrash size={13} /> {t('photoUpload.remove')}
          </button>
        </div>
      )}

      {uploadEnabled && !value.trim() && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      )}

      {uploadEnabled && !value.trim() && upload.phase === 'idle' && (
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
          aria-label={t('photoUpload.dropHint')}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-ink/20 bg-paper px-4 py-4 text-left transition-colors hover:border-ink/35 hover:bg-ink/[0.02] motion-reduce:transition-none',
            focusRing,
          )}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink/[0.05]">
            <IconPhoto size={22} className="text-ink/35" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-snug text-ink">{t('photoUpload.dropHint')}</span>
            <span className="block text-[11px] leading-snug text-ink/50">{t('photoUpload.dropTap')}</span>
          </span>
        </div>
      )}

      {upload.phase === 'preparing' && (
        <div className="flex items-center gap-2 rounded-xl border border-ink/15 bg-paper px-4 py-3 font-mono text-xs text-ink/60">
          <IconLoader2 size={14} className="animate-spin" /> {t('photoUpload.preparing')}
        </div>
      )}

      {upload.phase === 'uploading' && (
        <div className="space-y-2 rounded-xl border border-ink/15 bg-paper px-4 py-3">
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink/60">
            <span className="flex items-center gap-1.5">
              <IconLoader2 size={13} className="animate-spin text-ochre" aria-hidden /> {t('photoUpload.uploading', { percent: upload.pct })}
            </span>
            <button type="button" onClick={() => xhrRef.current?.abort()} className={cn('inline-flex items-center gap-1 text-ink/45 hover:text-stampred', focusRing)}>
              <IconX size={12} /> {t('photoUpload.cancel')}
            </button>
          </div>
          <span className="block h-2.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={upload.pct} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full bg-ochre transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${upload.pct}%` }} />
          </span>
        </div>
      )}

      {upload.phase === 'error' && (
        <div className="space-y-1.5 rounded-xl border border-stampred/30 bg-stampred/5 px-4 py-3">
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-stampred">
            <IconAlertTriangle size={13} className="shrink-0" /> {upload.message}
          </p>
          <button type="button" onClick={() => setUpload({ phase: 'idle' })} className={cn('font-mono text-[11px] text-ink/60 underline hover:no-underline', focusRing)}>
            {t('photoUpload.retry')}
          </button>
        </div>
      )}

      {justUploaded && (
        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-teal" role="status">
          <IconCircleCheck size={13} aria-hidden /> {t('photoUpload.uploaded')}
        </p>
      )}

      {uploadEnabled && !showUrlField && (
        <button
          type="button"
          onClick={() => setShowUrlField(true)}
          className={cn('mt-2 font-mono text-[10px] text-ink/45 underline decoration-ink/25 underline-offset-2 hover:text-ink/70', focusRing)}
        >
          {t('photoUpload.advanced')}
        </button>
      )}

      {!uploadEnabled && (
        <p className="mb-1.5 text-[11px] leading-snug text-ink/55">{t('photoUpload.notConfigured')}</p>
      )}

      {showUrlField && (
        <input
          id="apply-photoUrl"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('photoUrlPlaceholder')}
          inputMode="url"
          disabled={busy}
          className="mt-2 w-full rounded-lg border border-ink/15 bg-paper-light px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink/35 focus-visible:border-ochre focus-visible:ring-2 focus-visible:ring-ochre/25"
        />
      )}
    </div>
  );
}
