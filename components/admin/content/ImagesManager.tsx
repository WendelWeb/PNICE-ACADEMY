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
import type { ContentImage } from '@/lib/admin/content/store';
import { inputCls } from './fields';

export function ImagesManager({
  slug,
  mainImage,
  secondary,
}: {
  slug: string;
  mainImage: string | null;
  secondary: ContentImage[];
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

      {/* Main image */}
      <div className="mt-3">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('main')}</span>
        <div className="flex items-center gap-2">
          {main ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={main} alt="" className="h-12 w-16 rounded border border-ink/15 object-cover" />
          ) : (
            <span className="grid h-12 w-16 place-items-center rounded border border-dashed border-ink/20 font-mono text-[9px] text-ink/40">—</span>
          )}
          <input value={main} onChange={(e) => setMain(e.target.value)} placeholder={t('urlPlaceholder')} className={inputCls} />
          <button type="button" disabled={pending} onClick={() => act(() => setMainImageAction(slug, main))} className="shrink-0 rounded border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-ink/70 hover:bg-ink/[0.04]">
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
                <button type="button" onClick={() => act(() => moveSecondaryImageAction(slug, img.id, 'up'))} disabled={i === 0} className={iconBtn}><IconChevronUp size={12} /></button>
                <button type="button" onClick={() => act(() => moveSecondaryImageAction(slug, img.id, 'down'))} disabled={i === secondary.length - 1} className={iconBtn}><IconChevronDown size={12} /></button>
                <button type="button" onClick={() => act(() => removeSecondaryImageAction(slug, img.id))} className={cn(iconBtn, 'text-stampred')}><IconTrash size={12} /></button>
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
            onClick={() => act(async () => { const r = await addSecondaryImageAction(slug, url, alt); if (r.ok) { setUrl(''); setAlt(''); } return r; })}
            className="inline-flex items-center gap-1 rounded border border-teal/40 px-2.5 py-1.5 font-mono text-[11px] text-teal hover:bg-teal/10"
          >
            {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconPlus size={12} />} {t('add')}
          </button>
        </div>
      </div>
    </section>
  );
}
