'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconLoader2, IconPlus } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { createCourseAction } from '@/lib/admin/content-actions';
import { inputCls } from './fields';

export function CreateCourseForm({ suggestedCode }: { suggestedCode: string }) {
  const t = useTranslations('admin.cms.create');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(suggestedCode);
  const [titleHt, setTitleHt] = useState('');
  const [titleFr, setTitleFr] = useState('');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErr(null);
          const res = await createCourseAction({
            code: code.trim(),
            title_ht: titleHt.trim(),
            title_fr: titleFr.trim(),
            priceCents: Math.round((Number(price) || 0) * 100),
          });
          if (res.ok && res.slug) router.push(`/admin/cours/${res.slug}/editer`);
          else setErr(res.message === 'title_required' ? t('titleRequired') : t('error'));
        });
      }}
      className="max-w-2xl space-y-4 rounded-xl border border-ink/12 bg-paper-light p-5"
    >
      <p className="text-[11px] leading-snug text-graphite/60">{t('help')}</p>
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('code')}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} className={cn(inputCls, 'w-32')} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('titleHt')}</span>
          <input value={titleHt} onChange={(e) => setTitleHt(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('titleFr')}</span>
          <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('price')}</span>
        <span className="flex items-center gap-1 font-mono text-sm text-ink/55">$<input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={cn(inputCls, 'w-24')} /></span>
      </label>
      <p className="font-mono text-[10px] text-ink/45">{t('draftNote')}</p>
      {err && <p className="font-mono text-[11px] text-stampred">{err}</p>}
      <button type="submit" disabled={pending || (!titleHt && !titleFr)} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
        {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconPlus size={15} />}
        {t('submit')}
      </button>
    </form>
  );
}
