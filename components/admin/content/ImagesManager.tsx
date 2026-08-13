'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconPhoto,
  IconArrowRight,
  IconAlertTriangle,
  IconCircleCheck,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { AdminImage } from '@/lib/courses/write';
import { IMAGE_SOURCE_MAX_BYTES, deriveAutoAlt, uploadBlobName } from '@/lib/uploads/image-prep';
import { resizeImageFile } from '@/lib/uploads/resize-client';
import { postCourseAsset } from '@/components/content/courseAssetUpload';
import { Field, inputCls } from './fields';

type ContentResult = { ok: boolean; message?: string; slug?: string; count?: number };

/** The studio (Task C3-T4) injects its own owner-scoped versions here
 *  (lib/teacher/studio-actions.ts's 4 image actions) — REQUIRED, no default
 *  (Stage 1: no admin authoring surface exists to fall back to). */
export type ImageActions = {
  setMain: (slug: string, url: string) => Promise<ContentResult>;
  addSecondary: (slug: string, url: string, alt: string) => Promise<ContentResult>;
  removeSecondary: (slug: string, imageId: string) => Promise<ContentResult>;
  moveSecondary: (slug: string, imageId: string, dir: 'up' | 'down') => Promise<ContentResult>;
};

/** Same explicit state machine as VideoUpload (idle → preparing → envoi X % →
 *  saving → back to idle with a "✓ Foto a anrejistre" line, or error+retry). */
type UploadState =
  | { phase: 'idle' }
  | { phase: 'preparing' }
  | { phase: 'uploading'; pct: number }
  | { phase: 'saving' }
  | { phase: 'error'; message: string };

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * Stage 3 rebuild — "Foto kou a" as a real photo gallery. What changed from
 * the URL-paste-only version (the audit's bloquant finding):
 *  - ONE 4/3-card grid (truthful ratio — the exact aspect CourseCardGrid
 *    renders) showing the main photo (badged "Foto prensipal") and every
 *    secondary photo, with big arrow/remove buttons per card;
 *  - a big, friendly dropzone card (phone: tap opens the gallery via
 *    `accept="image/*"`) cloning VideoUpload's explicit state machine —
 *    idle → progress % (cancellable) → "✓ Foto a anrejistre" / error+retry —
 *    never a silent success or failure;
 *  - photos are resized IN THE BROWSER before upload (`resizeImageFile`,
 *    lib/uploads/resize-client.ts) and auto-saved on success: first photo → setMain, the rest →
 *    addSecondary with an auto-derived alt — no "Tèks alt" jargon in the
 *    primary path (it lives in the "Avanse" disclosure, next to the demoted
 *    URL-paste fields);
 *  - `not_configured` (Bunny Storage env absent) degrades to ONE calm
 *    sentence + the URL field as the primary path — never broken, no dev
 *    jargon.
 * The injected `ImageActions` contract and the `field-main-image` anchor
 * (the studio bon-de-contrôle rail's jump target) are UNCHANGED.
 */
export function ImagesManager({
  slug,
  mainImage,
  secondary,
  actions,
  courseTitle = '',
  uploadEnabled = true,
}: {
  slug: string;
  mainImage: string | null;
  secondary: AdminImage[];
  /** REQUIRED — injected by the teacher studio (Task C3-T4). */
  actions: ImageActions;
  /** Localized course title, used ONLY to auto-derive alt text for uploaded
   *  photos (Stage 3). Optional/additive — a call site that omits it falls
   *  back to the slug. */
  courseTitle?: string;
  /** Server-known "is the photo upload rail configured?" (Stage 3,
   *  `bunnyStorageConfigured()`): `false` renders the calm URL-first
   *  fallback immediately instead of after a doomed upload attempt.
   *  Optional/additive — defaults to true, and a runtime `not_configured`
   *  answer flips the same switch. */
  uploadEnabled?: boolean;
}) {
  const t = useTranslations('admin.cms.images');
  const router = useRouter();
  const [pending, start] = useTransition();

  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const [justSaved, setJustSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(!uploadEnabled);
  const [dragOver, setDragOver] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [mainUrl, setMainUrl] = useState(mainImage ?? '');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  /**
   * OPTIMISTIC gallery counts (review fix): `mainImage`/`secondary` are
   * SERVER props that only update once `router.refresh()` round-trips — a
   * window of several seconds on the slow connections this editor targets.
   * A teacher adding photos back-to-back inside that window used to hit the
   * stale `hasMain === false` branch twice, so photo 2 silently REPLACED
   * photo 1 as the main image. Successful saves now record themselves here
   * immediately, and the effect below resets the overlay as soon as the
   * refreshed props actually land (the props change is the reconciliation
   * signal — from then on the server truth wins again).
   */
  const [optimistic, setOptimistic] = useState({ hasMain: false, secondaryAdded: 0 });
  useEffect(() => {
    setOptimistic({ hasMain: false, secondaryAdded: 0 });
  }, [mainImage, secondary.length]);

  /** Server truth alone — drives the main photo CARD (there is no URL to
   *  draw before the refresh lands); `hasMain` below (server OR optimistic)
   *  drives every DECISION (setMain-vs-addSecondary, filled ✓, count). */
  const hasMainProp = Boolean(mainImage && mainImage.trim());
  const hasMain = hasMainProp || optimistic.hasMain;
  const secondaryCount = secondary.length + optimistic.secondaryAdded;
  const photoCount = (hasMain ? 1 : 0) + secondaryCount;
  const busy = pending || upload.phase === 'preparing' || upload.phase === 'uploading' || upload.phase === 'saving';

  /** A failed action's plain-language line: the write actions' `invalid_url`
   *  refusal (review fix — an unusable pasted link) gets its own specific
   *  copy; everything else keeps the generic "pa t anrejistre" message. */
  const failureText = (r: ContentResult) => t(r.message === 'invalid_url' ? 'errorUrl' : 'errorAction');

  const act = (fn: () => Promise<ContentResult>) =>
    start(async () => {
      setActionError(null);
      setJustSaved(false);
      const r = await fn();
      if (r.ok) router.refresh();
      else setActionError(failureText(r));
    });

  /** First photo becomes the main one; every later photo joins the slideshow
   *  with an auto-derived alt — the teacher never types "alt". */
  const autoSavePhoto = async (photoUrl: string): Promise<ContentResult> => {
    if (!hasMain) {
      const r = await actions.setMain(slug, photoUrl);
      if (r.ok) setOptimistic((o) => ({ ...o, hasMain: true }));
      return r;
    }
    const r = await actions.addSecondary(slug, photoUrl, deriveAutoAlt(courseTitle, slug, secondaryCount + 2));
    if (r.ok) setOptimistic((o) => ({ ...o, secondaryAdded: o.secondaryAdded + 1 }));
    return r;
  };

  const handleFile = async (file: File) => {
    setJustSaved(false);
    setActionError(null);

    // Plain-language refusals BEFORE any network (ProfileTab's OK_TYPES/
    // MAX_BYTES approach): a declared non-image type, or an absurdly large
    // source file. An EMPTY declared type (some Android gallery pickers) is
    // let through — the decode below is the real judge.
    if (file.type && !file.type.startsWith('image/')) {
      setUpload({ phase: 'error', message: t('errorNotImage') });
      return;
    }
    if (file.size > IMAGE_SOURCE_MAX_BYTES) {
      setUpload({ phase: 'error', message: t('errorTooLarge') });
      return;
    }

    setUpload({ phase: 'preparing' });
    const blob = await resizeImageFile(file);
    if (!blob) {
      setUpload({ phase: 'error', message: t('errorNotImage') });
      return;
    }

    setUpload({ phase: 'uploading', pct: 0 });
    const form = new FormData();
    form.append('file', blob, uploadBlobName(file.name, blob.type));
    form.append('slug', slug);
    form.append('purpose', 'image');
    const res = await postCourseAsset(form, (pct) => setUpload({ phase: 'uploading', pct }), xhrRef);
    xhrRef.current = null;
    if (inputRef.current) inputRef.current.value = '';

    if (!res.ok) {
      if (res.message === 'aborted') setUpload({ phase: 'idle' });
      else if (res.message === 'not_configured') {
        // Calm degradation, not an error: flip to the URL-first fallback.
        setNotConfigured(true);
        setUpload({ phase: 'idle' });
      } else if (res.message === 'too_large') setUpload({ phase: 'error', message: t('errorTooLarge') });
      else if (res.message === 'unsupported_type' || res.message === 'content_mismatch') {
        setUpload({ phase: 'error', message: t('errorNotImage') });
      } else setUpload({ phase: 'error', message: t('errorUpload') });
      return;
    }

    setUpload({ phase: 'saving' });
    try {
      const saved = await autoSavePhoto(res.url);
      if (!saved.ok) {
        setUpload({ phase: 'error', message: t('errorSave') });
        return;
      }
    } catch {
      setUpload({ phase: 'error', message: t('errorSave') });
      return;
    }
    setUpload({ phase: 'idle' });
    setJustSaved(true);
    router.refresh();
  };

  const openPicker = () => inputRef.current?.click();

  const confirmThen = (fn: () => Promise<ContentResult>) => {
    if (window.confirm(t('removeConfirm'))) act(fn);
  };

  /** URL-first fallback's one smart button: no main yet → it becomes the
   *  main photo; otherwise it joins the slideshow. */
  const addByUrl = () =>
    act(async () => {
      const clean = url.trim();
      const wasMain = hasMain;
      const r = wasMain
        ? await actions.addSecondary(slug, clean, deriveAutoAlt(courseTitle, slug, secondaryCount + 2))
        : await actions.setMain(slug, clean);
      if (r.ok) {
        setUrl('');
        setJustSaved(true);
        setOptimistic((o) => (wasMain ? { ...o, secondaryAdded: o.secondaryAdded + 1 } : { ...o, hasMain: true }));
      }
      return r;
    });

  const cardBtn = cn(
    'grid h-9 w-9 place-items-center rounded-lg border border-ink/15 text-ink/60 hover:bg-ink/[0.04] disabled:opacity-30',
    focusRing,
  );

  const photoCard = (img: { url: string; alt: string }, controls: React.ReactNode, isMain: boolean) => (
    <div className="overflow-hidden rounded-xl border border-ink/12 bg-paper">
      <div className="relative aspect-[4/3] bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={img.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        {isMain && (
          <span className="absolute left-2 top-2 rounded bg-ink/85 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-paper-light">
            {t('mainBadge')}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-ink/10 p-1.5">{controls}</div>
    </div>
  );

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')}</h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('note')}</p>
      {/* "W ap chèche videyo leson yo?" (Stage 1 — task-first navigation):
          this step used to be titled "Imaj", so video-seeking instinct landed
          HERE and dead-ended on a dev note. One plain cross-link back to the
          lessons-and-videos step (frozen `?tab=plan` contract, client-side
          relative push — same pathname, only the query changes). */}
      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] leading-snug text-ink/55">
        {t('videoCrossLink')}
        <button
          type="button"
          onClick={() => router.push('?tab=plan')}
          className={cn('inline-flex items-center gap-0.5 rounded font-medium text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal', focusRing)}
        >
          {t('videoCrossLinkCta')} <IconArrowRight size={12} aria-hidden />
        </button>
      </p>

      {/* The gallery — `id` is the studio bon-de-contrôle rail's jump target
          for `mainImageSet` (Task D1, frozen anchor contract): it lives on
          this always-rendered Field so the jump works with zero photos too
          (landing on the dropzone / URL field, the thing to actually fix). */}
      <div className="mt-3">
        <Field
          icon={IconPhoto}
          label={t('galleryLabel', { count: photoCount })}
          hint={t('galleryHint')}
          filled={hasMain}
          id="field-main-image"
        >
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

          {actionError && (
            <p className="mb-2 flex items-center gap-1.5 rounded-lg border border-stampred/30 bg-stampred/5 px-3 py-2 font-mono text-[11px] text-stampred" role="alert">
              <IconAlertTriangle size={13} className="shrink-0" /> {actionError}
            </p>
          )}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {hasMainProp && (
              <li>
                {photoCard(
                  { url: (mainImage ?? '').trim(), alt: '' },
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => confirmThen(() => actions.setMain(slug, ''))}
                    aria-label={t('removeAria')}
                    title={t('removeAria')}
                    className={cn(cardBtn, 'text-stampred')}
                  >
                    <IconTrash size={16} />
                  </button>,
                  true,
                )}
              </li>
            )}
            {secondary.map((img, i) => (
              <li key={img.id}>
                {photoCard(
                  img,
                  <>
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      onClick={() => act(() => actions.moveSecondary(slug, img.id, 'up'))}
                      aria-label={t('moveUpAria')}
                      title={t('moveUpAria')}
                      className={cardBtn}
                    >
                      <IconChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === secondary.length - 1}
                      onClick={() => act(() => actions.moveSecondary(slug, img.id, 'down'))}
                      aria-label={t('moveDownAria')}
                      title={t('moveDownAria')}
                      className={cardBtn}
                    >
                      <IconChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => confirmThen(() => actions.removeSecondary(slug, img.id))}
                      aria-label={t('removeAria')}
                      title={t('removeAria')}
                      className={cn(cardBtn, 'text-stampred')}
                    >
                      <IconTrash size={16} />
                    </button>
                  </>,
                  false,
                )}
              </li>
            ))}

            {/* The add card — full-width so it stays a big, forgiving target
                on a 360px phone (same D2 reasoning as the video dropzone). */}
            {!notConfigured && (
              <li className="col-span-full">
                {(upload.phase === 'idle' || upload.phase === 'preparing') && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={upload.phase === 'idle' ? openPicker : undefined}
                    aria-label={t('dropHint')}
                    onKeyDown={(e) => {
                      if (upload.phase === 'idle' && (e.key === 'Enter' || e.key === ' ')) {
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
                      if (upload.phase !== 'idle') return;
                      const file = e.dataTransfer.files?.[0];
                      if (file) void handleFile(file);
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors motion-reduce:transition-none',
                      focusRing,
                      dragOver ? 'border-ochre bg-ochre/10' : 'border-ink/20 bg-paper hover:border-ink/35 hover:bg-ink/[0.02]',
                    )}
                  >
                    <span className={cn('grid h-12 w-12 place-items-center rounded-full', dragOver ? 'bg-ochre/15' : 'bg-ink/[0.05]')}>
                      {upload.phase === 'preparing' ? (
                        <IconLoader2 size={26} className="animate-spin text-ochre" aria-hidden />
                      ) : (
                        <IconPhoto size={26} className={dragOver ? 'text-ochre' : 'text-ink/35'} aria-hidden />
                      )}
                    </span>
                    {upload.phase === 'preparing' ? (
                      <p className="font-mono text-xs text-ink/60">{t('preparing')}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium leading-snug text-ink">{t('dropHint')}</p>
                        <p className="max-w-xs text-[11px] leading-snug text-ink/50">{t('dropTap')}</p>
                        <p className="font-mono text-[9px] uppercase tracking-wide text-ink/40">{t('dropFormats')}</p>
                      </>
                    )}
                  </div>
                )}

                {upload.phase === 'uploading' && (
                  <div className="space-y-2 rounded-xl border border-ink/15 bg-paper px-4 py-4">
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink/60">
                      <span className="flex items-center gap-1.5">
                        <IconLoader2 size={13} className="animate-spin text-ochre" aria-hidden />{' '}
                        {t('uploading', { percent: upload.pct })}
                      </span>
                      <button
                        type="button"
                        onClick={() => xhrRef.current?.abort()}
                        className={cn('inline-flex shrink-0 items-center gap-1 text-ink/45 hover:text-stampred', focusRing)}
                      >
                        <IconX size={12} /> {t('cancel')}
                      </button>
                    </div>
                    <span
                      className="block h-2.5 overflow-hidden rounded-full bg-ink/10"
                      role="progressbar"
                      aria-valuenow={upload.pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        className="block h-full bg-ochre transition-[width] duration-150 motion-reduce:transition-none"
                        style={{ width: `${upload.pct}%` }}
                      />
                    </span>
                  </div>
                )}

                {upload.phase === 'saving' && (
                  <div className="flex items-center gap-2 rounded-xl border border-ink/15 bg-paper px-4 py-4 font-mono text-xs text-ink/60">
                    <IconLoader2 size={14} className="animate-spin" /> {t('saving')}
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
                      {t('retry')}
                    </button>
                  </div>
                )}
              </li>
            )}
          </ul>

          {justSaved && (
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-teal" role="status">
              <IconCircleCheck size={14} aria-hidden /> {t('saved')}
            </p>
          )}

          {/* not_configured degradation: one calm sentence, then the link
              field IS the primary path — no dev jargon, nothing broken. */}
          {notConfigured && (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] leading-snug text-ink/60">{t('notConfigured')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t('urlPlaceholder')}
                  aria-label={t('urlPlaceholder')}
                  className={cn(inputCls, 'min-w-0 flex-1')}
                />
                <button
                  type="button"
                  disabled={busy || !url.trim()}
                  onClick={addByUrl}
                  className={cn('inline-flex items-center gap-1 rounded border border-teal/40 px-2.5 py-1.5 font-mono text-[11px] text-teal hover:bg-teal/10 disabled:opacity-40', focusRing)}
                >
                  {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconPlus size={12} />} {t('add')}
                </button>
              </div>
            </div>
          )}
        </Field>
      </div>

      {/* Avanse — the demoted URL-paste fields + the alt-text input, out of
          the primary path (Stage 3). Hidden while the URL field IS the
          primary path (not configured) to avoid two competing link inputs. */}
      {!notConfigured && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            className={cn('inline-flex items-center gap-1 font-mono text-[10px] text-ink/45 hover:text-ink/70', focusRing)}
          >
            {advanced ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />} {t('advanced')}
          </button>
          {advanced && (
            <div className="mt-1.5 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-full font-mono text-[10px] uppercase tracking-wide text-ink/45 sm:w-auto">{t('main')}</span>
                <input
                  value={mainUrl}
                  onChange={(e) => setMainUrl(e.target.value)}
                  placeholder={t('urlPlaceholder')}
                  aria-label={t('main')}
                  className={cn(inputCls, 'min-w-0 flex-1')}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const r = await actions.setMain(slug, mainUrl);
                      if (r.ok) setOptimistic((o) => ({ ...o, hasMain: Boolean(mainUrl.trim()) }));
                      return r;
                    })
                  }
                  className={cn('shrink-0 rounded border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-ink/70 hover:bg-ink/[0.04]', focusRing)}
                >
                  {t('setMain')}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t('urlPlaceholder')}
                  aria-label={t('urlPlaceholder')}
                  className={cn(inputCls, 'min-w-0 flex-1')}
                />
                <input
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                  placeholder={t('alt')}
                  aria-label={t('alt')}
                  className={cn(inputCls, 'w-40')}
                />
                <button
                  type="button"
                  disabled={busy || !url.trim()}
                  onClick={() =>
                    act(async () => {
                      const r = await actions.addSecondary(
                        slug,
                        url,
                        alt.trim() || deriveAutoAlt(courseTitle, slug, secondaryCount + 2),
                      );
                      if (r.ok) {
                        setUrl('');
                        setAlt('');
                        setOptimistic((o) => ({ ...o, secondaryAdded: o.secondaryAdded + 1 }));
                      }
                      return r;
                    })
                  }
                  className={cn('inline-flex items-center gap-1 rounded border border-teal/40 px-2.5 py-1.5 font-mono text-[11px] text-teal hover:bg-teal/10 disabled:opacity-40', focusRing)}
                >
                  {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconPlus size={12} />} {t('add')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
