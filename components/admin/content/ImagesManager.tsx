'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconPlus, IconTrash, IconChevronUp, IconChevronDown, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import {
  setMainImageAction,
  addSecondaryImageAction,
  removeSecondaryImageAction,
  moveSecondaryImageAction,
} from '@/lib/admin/content-actions';
import type { AdminImage } from '@/lib/courses/write';
import { inputCls } from './fields';

type ContentResult = { ok: boolean; message?: string; slug?: string; count?: number };

/** Same shape as `lib/admin/content-actions.ts`'s 4 image actions — the
 *  studio (Task C3-T4) injects its own owner-scoped versions here instead. */
export type ImageActions = {
  setMain: (slug: string, url: string) => Promise<ContentResult>;
  addSecondary: (slug: string, url: string, alt: string) => Promise<ContentResult>;
  removeSecondary: (slug: string, imageId: string) => Promise<ContentResult>;
  moveSecondary: (slug: string, imageId: string, dir: 'up' | 'down') => Promise<ContentResult>;
};

const defaultImageActions: ImageActions = {
  setMain: setMainImageAction,
  addSecondary: addSecondaryImageAction,
  removeSecondary: removeSecondaryImageAction,
  moveSecondary: moveSecondaryImageAction,
};

export function ImagesManager({
  slug,
  mainImage,
  secondary,
  actions = defaultImageActions,
}: {
  slug: string;
  mainImage: string | null;
  secondary: AdminImage[];
  /** Injected by the teacher studio (Task C3-T4); defaults to the admin CMS
   *  actions so every existing `/admin/cours/[slug]/editer` call site is
   *  unchanged. */
  actions?: ImageActions;
}) {
  const t = useTranslations('admin.cms.images');
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean }>) => start(async () => { if ((await fn()).ok) router.refresh(); });

  const [main, setMain] = useState(mainImage ?? '');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const iconBtn = 'grid h-6 w-6 place-items-center rounded border border-ink/15 text-ink/55 hover:bg-ink/[0.04] disabled:opacity-30';

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')}</h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('note')}</p>

      {/* Main image — `id` is the studio bon-de-contrôle rail's jump target
          for `mainImageSet` (Task D1). */}
      <div id="field-main-image" className="mt-3">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('main')}</span>
        <div className="flex items-center gap-2">
          {main ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={main} alt="" className="h-12 w-16 rounded border border-ink/15 object-cover" />
          ) : (
            <span className="grid h-12 w-16 place-items-center rounded border border-dashed border-ink/20 font-mono text-[9px] text-ink/40">—</span>
          )}
          <input value={main} onChange={(e) => setMain(e.target.value)} placeholder={t('urlPlaceholder')} className={inputCls} />
          <button type="button" disabled={pending} onClick={() => act(() => actions.setMain(slug, main))} className="shrink-0 rounded border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-ink/70 hover:bg-ink/[0.04]">
            {t('setMain')}
          </button>
        </div>
      </div>

      {/* Secondary images */}
      <div className="mt-4">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('secondary')} · {secondary.length}</span>
        {secondary.length > 0 && (
          <ul className="space-y-1.5">
            {secondary.map((img, i) => (
              <li key={img.id} className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt} className="h-9 w-12 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink/55">{img.url}</span>
                <button type="button" onClick={() => act(() => actions.moveSecondary(slug, img.id, 'up'))} disabled={i === 0} className={iconBtn}><IconChevronUp size={12} /></button>
                <button type="button" onClick={() => act(() => actions.moveSecondary(slug, img.id, 'down'))} disabled={i === secondary.length - 1} className={iconBtn}><IconChevronDown size={12} /></button>
                <button type="button" onClick={() => act(() => actions.removeSecondary(slug, img.id))} className={cn(iconBtn, 'text-stampred')}><IconTrash size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('urlPlaceholder')} className={cn(inputCls, 'flex-1')} />
          <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={t('alt')} className={cn(inputCls, 'w-32')} />
          <button
            type="button"
            disabled={pending || !url.trim()}
            onClick={() => act(async () => { const r = await actions.addSecondary(slug, url, alt); if (r.ok) { setUrl(''); setAlt(''); } return r; })}
            className="inline-flex items-center gap-1 rounded border border-teal/40 px-2.5 py-1.5 font-mono text-[11px] text-teal hover:bg-teal/10"
          >
            {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconPlus size={12} />} {t('add')}
          </button>
        </div>
      </div>
    </section>
  );
}
