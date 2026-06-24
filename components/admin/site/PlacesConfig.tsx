'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconArmchair, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { setPlacesAction } from '@/lib/admin/site-actions';

const inputCls = 'w-24 rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function PlacesConfig({ total, taken, enabled }: { total: number; taken: number; enabled: boolean }) {
  const t = useTranslations('admin.settings.places');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tt, setTt] = useState(String(total));
  const [tk, setTk] = useState(String(taken));
  const [en, setEn] = useState(enabled);
  const [saved, setSaved] = useState(false);

  const left = Math.max(0, (Number(tt) || 0) - (Number(tk) || 0));

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconArmchair size={13} /> {t('title')}
      </h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('note')}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1"><span className="font-mono text-[10px] uppercase text-ink/45">{t('total')}</span><input type="number" min="0" value={tt} onChange={(e) => { setTt(e.target.value); setSaved(false); }} className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="font-mono text-[10px] uppercase text-ink/45">{t('taken')}</span><input type="number" min="0" value={tk} onChange={(e) => { setTk(e.target.value); setSaved(false); }} className={inputCls} /></label>
        <label className="flex items-center gap-1.5 pb-1.5 font-mono text-[11px] text-ink/70"><input type="checkbox" checked={en} onChange={(e) => { setEn(e.target.checked); setSaved(false); }} className="h-4 w-4 accent-ochre" />{t('enabled')}</label>
        <span className="pb-1.5 font-mono text-[11px] text-teal">{t('preview', { left, total: tt })}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setPlacesAction({ total: Number(tt) || 0, taken: Number(tk) || 0, enabled: en }); if (r.ok) { setSaved(true); router.refresh(); } })} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
          {pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('save')}
        </button>
        {saved && <span className="font-mono text-[11px] text-teal">{t('saved')}</span>}
      </div>
    </section>
  );
}
