'use client';

import { useTranslations } from 'next-intl';
import { IconPlus, IconTrash, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
export const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink ' + focusRing;

/** A bilingual field: ht + fr side by side (stacked on mobile). */
export function BilingualText({
  label,
  ht,
  fr,
  onHt,
  onFr,
  area,
  placeholder,
}: {
  label: string;
  ht: string;
  fr: string;
  onHt: (v: string) => void;
  onFr: (v: string) => void;
  area?: boolean;
  placeholder?: string;
}) {
  const Field = area ? 'textarea' : 'input';
  return (
    <div>
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{label}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-0.5 block font-mono text-[9px] uppercase text-ink/40">Kreyòl</span>
          <Field value={ht} onChange={(e) => onHt(e.target.value)} placeholder={placeholder} className={cn(inputCls, area && 'min-h-[64px] resize-y')} />
        </label>
        <label className="block">
          <span className="mb-0.5 block font-mono text-[9px] uppercase text-ink/40">Français</span>
          <Field value={fr} onChange={(e) => onFr(e.target.value)} placeholder={placeholder} className={cn(inputCls, area && 'min-h-[64px] resize-y')} />
        </label>
      </div>
    </div>
  );
}

const iconBtn = 'grid h-6 w-6 place-items-center rounded border border-ink/15 text-ink/55 hover:bg-ink/[0.04] disabled:opacity-30';

/** Parallel ht/fr string lists edited as rows (add / remove / reorder). */
export function PairedList({
  label,
  ht,
  fr,
  onChange,
}: {
  label: string;
  ht: string[];
  fr: string[];
  onChange: (ht: string[], fr: string[]) => void;
}) {
  const len = Math.max(ht.length, fr.length);
  const rows = Array.from({ length: len });
  const setRow = (i: number, lang: 'ht' | 'fr', v: string) => {
    const nh = [...ht];
    const nf = [...fr];
    while (nh.length < len) nh.push('');
    while (nf.length < len) nf.push('');
    if (lang === 'ht') nh[i] = v;
    else nf[i] = v;
    onChange(nh, nf);
  };
  const add = () => onChange([...ht, ''], [...fr, '']);
  const remove = (i: number) => onChange(ht.filter((_, k) => k !== i), fr.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= len) return;
    const nh = [...ht];
    const nf = [...fr];
    [nh[i], nh[j]] = [nh[j] ?? '', nh[i] ?? ''];
    [nf[i], nf[j]] = [nf[j] ?? '', nf[i] ?? ''];
    onChange(nh, nf);
  };

  return (
    <div>
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{label}</span>
      <ul className="space-y-1.5">
        {rows.map((_, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <input value={ht[i] ?? ''} onChange={(e) => setRow(i, 'ht', e.target.value)} placeholder="Kreyòl" className={inputCls} />
            <input value={fr[i] ?? ''} onChange={(e) => setRow(i, 'fr', e.target.value)} placeholder="Français" className={inputCls} />
            <span className="flex shrink-0 flex-col gap-0.5 pt-0.5">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label="up"><IconChevronUp size={12} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === len - 1} className={iconBtn} aria-label="down"><IconChevronDown size={12} /></button>
            </span>
            <button type="button" onClick={() => remove(i)} className={cn(iconBtn, 'text-stampred')} aria-label="remove"><IconTrash size={12} /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline">
        <IconPlus size={12} /> +
      </button>
    </div>
  );
}

export type FaqItem = { id: string; q_ht: string; q_fr: string; a_ht: string; a_fr: string };

export function FaqEditor({ faq, onChange }: { faq: FaqItem[]; onChange: (f: FaqItem[]) => void }) {
  const t = useTranslations('admin.cms.editor');
  const set = (i: number, patch: Partial<FaqItem>) => onChange(faq.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const add = () => onChange([...faq, { id: `new_${Date.now()}`, q_ht: '', q_fr: '', a_ht: '', a_fr: '' }]);
  const remove = (i: number) => onChange(faq.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= faq.length) return;
    const n = [...faq];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };

  return (
    <div>
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('faq')}</span>
      <ul className="space-y-2">
        {faq.map((f, i) => (
          <li key={f.id} className="rounded-lg border border-ink/10 bg-paper p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[10px] text-ink/45">#{i + 1}</span>
              <span className="flex gap-0.5">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn}><IconChevronUp size={12} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === faq.length - 1} className={iconBtn}><IconChevronDown size={12} /></button>
                <button type="button" onClick={() => remove(i)} className={cn(iconBtn, 'text-stampred')}><IconTrash size={12} /></button>
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <input value={f.q_ht} onChange={(e) => set(i, { q_ht: e.target.value })} placeholder={t('q') + ' (ht)'} className={inputCls} />
              <input value={f.q_fr} onChange={(e) => set(i, { q_fr: e.target.value })} placeholder={t('q') + ' (fr)'} className={inputCls} />
              <textarea value={f.a_ht} onChange={(e) => set(i, { a_ht: e.target.value })} placeholder={t('a') + ' (ht)'} className={cn(inputCls, 'min-h-[44px] resize-y')} />
              <textarea value={f.a_fr} onChange={(e) => set(i, { a_fr: e.target.value })} placeholder={t('a') + ' (fr)'} className={cn(inputCls, 'min-h-[44px] resize-y')} />
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline">
        <IconPlus size={12} /> {t('addFaq')}
      </button>
    </div>
  );
}
