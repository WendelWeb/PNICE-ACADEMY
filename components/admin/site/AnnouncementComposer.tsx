'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { IconSend, IconLoader2, IconEye, IconAlertTriangle, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { sendAnnouncementAction } from '@/lib/admin/site-actions';

type Seg = 'all' | 'active_subscriber' | 'one_off' | 'free';
const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function AnnouncementComposer({ counts }: { counts: Record<Seg, number> }) {
  const t = useTranslations('admin.marketing');
  const [pending, start] = useTransition();
  const [segment, setSegment] = useState<Seg>('all');
  const [subjectHt, setSubjectHt] = useState('');
  const [subjectFr, setSubjectFr] = useState('');
  const [bodyHt, setBodyHt] = useState('');
  const [bodyFr, setBodyFr] = useState('');
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  const count = counts[segment];

  return (
    <section className="space-y-4 rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('compose')}</h2>

      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('segment')}</span>
        <select value={segment} onChange={(e) => setSegment(e.target.value as Seg)} className={cn(inputCls, 'w-auto cursor-pointer')}>
          <option value="all">{t('seg.all')} ({counts.all})</option>
          <option value="active_subscriber">{t('seg.active_subscriber')} ({counts.active_subscriber})</option>
          <option value="one_off">{t('seg.one_off')} ({counts.one_off})</option>
          <option value="free">{t('seg.free')} ({counts.free})</option>
        </select>
      </label>

      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('subject')}</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={subjectHt} onChange={(e) => setSubjectHt(e.target.value)} placeholder="Kreyòl" className={inputCls} />
          <input value={subjectFr} onChange={(e) => setSubjectFr(e.target.value)} placeholder="Français" className={inputCls} />
        </div>
      </div>
      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('body')}</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <textarea value={bodyHt} onChange={(e) => setBodyHt(e.target.value)} placeholder="Kreyòl" className={cn(inputCls, 'min-h-[120px] resize-y')} />
          <textarea value={bodyFr} onChange={(e) => setBodyFr(e.target.value)} placeholder="Français" className={cn(inputCls, 'min-h-[120px] resize-y')} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPreview((v) => !v)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}><IconEye size={15} /> {t('preview')}</button>
        <button type="button" disabled={!subjectFr.trim() || !bodyFr.trim()} onClick={() => setConfirm(true)} className={cn(buttonClasses('primary', 'md'), 'text-xs')}><IconSend size={15} /> {t('send')}</button>
        {sent !== null && <span className="font-mono text-[11px] text-teal">{t('sentOk', { count: sent })}</span>}
      </div>

      {preview && (
        <div className="rounded-lg border border-ink/10 bg-paper p-3 text-sm">
          <p className="font-mono text-[10px] uppercase text-ink/45">Français</p>
          <p className="mt-0.5 font-semibold text-ink">{subjectFr || '—'}</p>
          <p className="mt-1 whitespace-pre-wrap text-graphite/80">{bodyFr || '—'}</p>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{t('confirmTitle')}</h3>
              <button type="button" onClick={() => setConfirm(false)} className="text-ink/50 hover:text-ink"><IconX size={18} /></button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-sm text-graphite/80">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-ochre" />
              {t('confirmBody', { count })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('cancel')}</button>
              <button type="button" disabled={pending} onClick={() => start(async () => { const r = await sendAnnouncementAction({ segment, subjectHt, subjectFr, bodyHt, bodyFr }); if (r.ok) { setSent(r.count ?? count); setConfirm(false); } })} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('confirmSend')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
