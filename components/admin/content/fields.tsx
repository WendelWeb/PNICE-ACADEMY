'use client';

import { useTranslations } from 'next-intl';
import { IconPlus, IconTrash, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
export const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink ' + focusRing;

/** Shown next to a field's label when only one locale's input is rendered (mono course, see `mono` prop below). */
const MONO_LOCALE_NAME: Record<'ht' | 'fr', string> = { ht: 'Kreyòl', fr: 'Français' };

/**
 * A bilingual field: ht + fr side by side (stacked on mobile) — OR, when
 * `mono` is set (Task: course-language, `AdminCourse.bilingual === false`),
 * a SINGLE input for just that one locale. The "other" locale's value/setter
 * are still accepted (unused when `mono`) so every call site can pass the
 * same props regardless of mode — `lib/courses/write.ts`'s
 * `mirrorBilingualFields` is what actually keeps the hidden side in sync on
 * save, this component never needs to know that.
 */
export function BilingualText({
  label,
  ht,
  fr,
  onHt,
  onFr,
  area,
  placeholder,
  mono,
}: {
  label: string;
  ht: string;
  fr: string;
  onHt: (v: string) => void;
  onFr: (v: string) => void;
  area?: boolean;
  placeholder?: string;
  mono?: 'ht' | 'fr';
}) {
  const Field = area ? 'textarea' : 'input';
  if (mono) {
    const value = mono === 'ht' ? ht : fr;
    const onChange = mono === 'ht' ? onHt : onFr;
    return (
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">
          {label} <span className="text-ink/40">· {MONO_LOCALE_NAME[mono]}</span>
        </span>
        <Field value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputCls, area && 'min-h-[64px] resize-y')} />
      </label>
    );
  }
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

/**
 * Parallel ht/fr string lists edited as rows (add / remove / reorder) — OR,
 * when `mono` is set (Task: course-language), a SINGLE-column list editing
 * only that locale's array. The "other" locale's array is left completely
 * untouched by every mono operation below (its stale/blank content doesn't
 * matter — `mirrorBilingualFields` fully replaces it with the primary
 * array's content on save, see `BilingualText`'s doc comment for the same
 * reasoning).
 */
export function PairedList({
  label,
  ht,
  fr,
  onChange,
  mono,
}: {
  label: string;
  ht: string[];
  fr: string[];
  onChange: (ht: string[], fr: string[]) => void;
  mono?: 'ht' | 'fr';
}) {
  if (mono) {
    const items = mono === 'ht' ? ht : fr;
    const setItems = (next: string[]) => (mono === 'ht' ? onChange(next, fr) : onChange(ht, next));
    return (
      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">
          {label} <span className="text-ink/40">· {MONO_LOCALE_NAME[mono]}</span>
        </span>
        <ul className="space-y-1.5">
          {items.map((v, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <input
                value={v}
                onChange={(e) => setItems(items.map((x, k) => (k === i ? e.target.value : x)))}
                className={inputCls}
              />
              <span className="flex shrink-0 flex-col gap-0.5 pt-0.5">
                <button type="button" onClick={() => { if (i > 0) { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setItems(n); } }} disabled={i === 0} className={iconBtn} aria-label="up"><IconChevronUp size={12} /></button>
                <button type="button" onClick={() => { if (i < items.length - 1) { const n = [...items]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; setItems(n); } }} disabled={i === items.length - 1} className={iconBtn} aria-label="down"><IconChevronDown size={12} /></button>
              </span>
              <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} className={cn(iconBtn, 'text-stampred')} aria-label="remove"><IconTrash size={12} /></button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setItems([...items, ''])} className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline">
          <IconPlus size={12} /> +
        </button>
      </div>
    );
  }

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

/**
 * `mono` (Task: course-language): when set, each FAQ entry shows only that
 * locale's q/a inputs instead of the ht+fr grid — the hidden locale's
 * `q_{other}`/`a_{other}` stay whatever they were (server-side
 * `mirrorBilingualFields` replaces them with the primary side on save, same
 * reasoning as `BilingualText`/`PairedList` above).
 */
export function FaqEditor({ faq, onChange, mono }: { faq: FaqItem[]; onChange: (f: FaqItem[]) => void; mono?: 'ht' | 'fr' }) {
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
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">
        {t('faq')}
        {mono && <span className="text-ink/40"> · {MONO_LOCALE_NAME[mono]}</span>}
      </span>
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
            {mono ? (
              <div className="grid gap-1.5">
                <input value={mono === 'ht' ? f.q_ht : f.q_fr} onChange={(e) => set(i, mono === 'ht' ? { q_ht: e.target.value } : { q_fr: e.target.value })} placeholder={t('q')} className={inputCls} />
                <textarea value={mono === 'ht' ? f.a_ht : f.a_fr} onChange={(e) => set(i, mono === 'ht' ? { a_ht: e.target.value } : { a_fr: e.target.value })} placeholder={t('a')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                <input value={f.q_ht} onChange={(e) => set(i, { q_ht: e.target.value })} placeholder={t('q') + ' (ht)'} className={inputCls} />
                <input value={f.q_fr} onChange={(e) => set(i, { q_fr: e.target.value })} placeholder={t('q') + ' (fr)'} className={inputCls} />
                <textarea value={f.a_ht} onChange={(e) => set(i, { a_ht: e.target.value })} placeholder={t('a') + ' (ht)'} className={cn(inputCls, 'min-h-[44px] resize-y')} />
                <textarea value={f.a_fr} onChange={(e) => set(i, { a_fr: e.target.value })} placeholder={t('a') + ' (fr)'} className={cn(inputCls, 'min-h-[44px] resize-y')} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline">
        <IconPlus size={12} /> {t('addFaq')}
      </button>
    </div>
  );
}
