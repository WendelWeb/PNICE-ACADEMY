'use client';

import { useTranslations } from 'next-intl';
import { IconPlus, IconTrash, IconChevronUp, IconChevronDown, IconCircleCheck, type Icon as TablerIcon } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
export const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink ' + focusRing;

/**
 * Shown next to a field's label when only one locale's input is rendered
 * (mono course, see `mono` prop below). Exported (Task: lesson-language) so
 * `components/admin/content/plan/LessonEditPanel.tsx` renders the exact same
 * "· Kreyòl"/"· Français" hint for a monolingual course's lesson fields,
 * instead of a second hardcoded copy of this two-entry map.
 */
export const MONO_LOCALE_NAME: Record<'ht' | 'fr', string> = { ht: 'Kreyòl', fr: 'Français' };

const iconBtn = 'grid h-6 w-6 place-items-center rounded border border-ink/15 text-ink/55 hover:bg-ink/[0.04] disabled:opacity-30 ' + focusRing;

function hasText(v: string): boolean {
  return v.trim() !== '';
}

/**
 * "Anatomie d'un champ" (Task D2 — le soin du détail): the ONE shape every
 * course/chapter/lesson field shares from here on — a recognizable icon, a
 * plain-language label, a one-line "why this matters" hint underneath, and
 * (once the caller says the field has real content) a teal ✓. `example`
 * renders as a small localized "Egzanp/Exemple : « … »" line using REAL copy
 * pulled from the seeded courses (see call sites), not a generic placeholder.
 *
 * Deliberately presentation-only: this never touches the input's value or
 * commit logic, it only wraps whatever control(s) the caller passes as
 * `children` — `BilingualText`/`PairedList`/`FaqEditor` below use it for
 * their own header, and `CourseEditor`/`LessonEditPanel`/`ChapterGroup` use
 * it directly around a single input (price, chapter title, etc).
 *
 * `id` is the studio bon-de-contrôle rail's jump target (Task D1): placed on
 * THIS wrapper (not deep inside `children`) so `jumpToAnchor` always finds a
 * stable container to scroll to, regardless of which locale's input inside
 * ends up focused.
 */
export function Field({
  icon: Icon,
  label,
  hint,
  example,
  filled,
  id,
  children,
}: {
  icon?: TablerIcon;
  label: React.ReactNode;
  /** The one-line "à quoi ça sert" — omitted for system/disabled fields that
   *  need no explanation (code, slug). */
  hint?: string;
  /** Real sample text ("ex : « Biznis shipping Etazini-Ayiti »") — omitted
   *  where an example wouldn't help (numeric/disabled fields). */
  example?: string;
  /** Undefined = no indicator (system fields, not part of "did you fill this
   *  in"); true/false = the teal ✓ shows or doesn't. */
  filled?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('common');
  return (
    <div id={id}>
      <div className="flex items-start gap-2">
        {Icon && (
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink/[0.06] text-ink/50" aria-hidden>
            <Icon size={14} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink/55">
            <span className="min-w-0">{label}</span>
            {filled && <IconCircleCheck size={13} className="shrink-0 text-teal" aria-hidden />}
          </span>
          {hint && <p className="mt-0.5 text-[11px] leading-snug text-ink/60">{hint}</p>}
        </div>
      </div>
      <div className={cn('mt-1.5', Icon && 'sm:pl-8')}>
        {children}
        {example && (
          <p className="mt-1 text-[11px] italic leading-snug text-ink/40">
            {t('example')} : « {example} »
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A bilingual field: ht + fr side by side (stacked on mobile) — OR, when
 * `mono` is set (Task: course-language, `AdminCourse.bilingual === false`),
 * a SINGLE input for just that one locale. The "other" locale's value/setter
 * are still accepted (unused when `mono`) so every call site can pass the
 * same props regardless of mode — `lib/courses/write.ts`'s
 * `mirrorBilingualFields` is what actually keeps the hidden side in sync on
 * save, this component never needs to know that.
 *
 * `icon`/`hint`/`example` (Task D2 — anatomie d'un champ) render via the
 * shared `Field` wrapper above; `filled` defaults to "every visible input has
 * content" (the one mono input, or both ht AND fr for a bilingual field) but
 * can be overridden for a field whose completeness means something else.
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
  id,
  icon,
  hint,
  example,
  filled,
}: {
  label: string;
  ht: string;
  fr: string;
  onHt: (v: string) => void;
  onFr: (v: string) => void;
  area?: boolean;
  placeholder?: string;
  mono?: 'ht' | 'fr';
  /** Anchor id for the studio's "bon de contrôle" rail (Task D1 — le
   *  bordereau): a checklist row jumps here via `scrollIntoView` + focuses
   *  the first empty input inside — see `components/teacher/studio/jump.ts`.
   *  Omitted everywhere this isn't a jump target (the vast majority of
   *  `BilingualText` call sites). */
  id?: string;
  icon?: TablerIcon;
  hint?: string;
  example?: string;
  filled?: boolean;
}) {
  const InputTag = area ? 'textarea' : 'input';
  const computedFilled = mono ? hasText(mono === 'ht' ? ht : fr) : hasText(ht) && hasText(fr);
  const fieldLabel = mono ? (
    <>
      {label} <span className="text-ink/40">· {MONO_LOCALE_NAME[mono]}</span>
    </>
  ) : (
    label
  );

  return (
    <Field icon={icon} label={fieldLabel} hint={hint} example={example} filled={filled ?? computedFilled} id={id}>
      {mono ? (
        <InputTag
          value={mono === 'ht' ? ht : fr}
          onChange={(e) => (mono === 'ht' ? onHt : onFr)(e.target.value)}
          placeholder={placeholder}
          aria-label={`${label} · ${MONO_LOCALE_NAME[mono]}`}
          className={cn(inputCls, area && 'min-h-[64px] resize-y')}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-0.5 block font-mono text-[9px] uppercase text-ink/40">Kreyòl</span>
            <InputTag value={ht} onChange={(e) => onHt(e.target.value)} placeholder={placeholder} className={cn(inputCls, area && 'min-h-[64px] resize-y')} />
          </label>
          <label className="block">
            <span className="mb-0.5 block font-mono text-[9px] uppercase text-ink/40">Français</span>
            <InputTag value={fr} onChange={(e) => onFr(e.target.value)} placeholder={placeholder} className={cn(inputCls, area && 'min-h-[64px] resize-y')} />
          </label>
        </div>
      )}
    </Field>
  );
}

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
  icon,
  hint,
  example,
}: {
  label: string;
  ht: string[];
  fr: string[];
  onChange: (ht: string[], fr: string[]) => void;
  mono?: 'ht' | 'fr';
  icon?: TablerIcon;
  hint?: string;
  example?: string;
}) {
  const t = useTranslations('admin.cms.editor');

  if (mono) {
    const items = mono === 'ht' ? ht : fr;
    const setItems = (next: string[]) => (mono === 'ht' ? onChange(next, fr) : onChange(ht, next));
    const fieldLabel = (
      <>
        {label} <span className="text-ink/40">· {MONO_LOCALE_NAME[mono]}</span>
      </>
    );
    return (
      <Field icon={icon} label={fieldLabel} hint={hint} example={example} filled={items.some(hasText)}>
        <ul className="space-y-1.5">
          {items.map((v, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <input
                value={v}
                onChange={(e) => setItems(items.map((x, k) => (k === i ? e.target.value : x)))}
                aria-label={`${label} · ${MONO_LOCALE_NAME[mono]} #${i + 1}`}
                className={inputCls}
              />
              <span className="flex shrink-0 flex-col gap-0.5 pt-0.5">
                <button type="button" onClick={() => { if (i > 0) { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setItems(n); } }} disabled={i === 0} className={iconBtn} aria-label={t('aria.moveUp')} title={t('aria.moveUp')}><IconChevronUp size={12} /></button>
                <button type="button" onClick={() => { if (i < items.length - 1) { const n = [...items]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; setItems(n); } }} disabled={i === items.length - 1} className={iconBtn} aria-label={t('aria.moveDown')} title={t('aria.moveDown')}><IconChevronDown size={12} /></button>
              </span>
              <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} className={cn(iconBtn, 'text-stampred')} aria-label={t('aria.remove')} title={t('aria.remove')}><IconTrash size={12} /></button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setItems([...items, ''])} className={cn('mt-2 inline-flex items-center gap-1 rounded font-mono text-[11px] text-teal hover:underline', focusRing)}>
          <IconPlus size={12} /> +
        </button>
      </Field>
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
    <Field icon={icon} label={label} hint={hint} example={example} filled={ht.some(hasText) && fr.some(hasText)}>
      <ul className="space-y-1.5">
        {rows.map((_, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <input value={ht[i] ?? ''} onChange={(e) => setRow(i, 'ht', e.target.value)} placeholder="Kreyòl" aria-label={`${label} · Kreyòl #${i + 1}`} className={inputCls} />
            <input value={fr[i] ?? ''} onChange={(e) => setRow(i, 'fr', e.target.value)} placeholder="Français" aria-label={`${label} · Français #${i + 1}`} className={inputCls} />
            <span className="flex shrink-0 flex-col gap-0.5 pt-0.5">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label={t('aria.moveUp')} title={t('aria.moveUp')}><IconChevronUp size={12} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === len - 1} className={iconBtn} aria-label={t('aria.moveDown')} title={t('aria.moveDown')}><IconChevronDown size={12} /></button>
            </span>
            <button type="button" onClick={() => remove(i)} className={cn(iconBtn, 'text-stampred')} aria-label={t('aria.remove')} title={t('aria.remove')}><IconTrash size={12} /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className={cn('mt-2 inline-flex items-center gap-1 rounded font-mono text-[11px] text-teal hover:underline', focusRing)}>
        <IconPlus size={12} /> +
      </button>
    </Field>
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
export function FaqEditor({
  faq,
  onChange,
  mono,
  icon,
  hint,
  exampleQ,
  exampleA,
}: {
  faq: FaqItem[];
  onChange: (f: FaqItem[]) => void;
  mono?: 'ht' | 'fr';
  icon?: TablerIcon;
  hint?: string;
  exampleQ?: string;
  exampleA?: string;
}) {
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

  const label = (
    <>
      {t('faq')}
      {mono && <span className="text-ink/40"> · {MONO_LOCALE_NAME[mono]}</span>}
    </>
  );
  const example = exampleQ && exampleA ? `${exampleQ} — ${exampleA}` : undefined;

  return (
    <Field icon={icon} label={label} hint={hint} example={example} filled={faq.some((f) => hasText(f.q_ht) || hasText(f.q_fr))}>
      <ul className="space-y-2">
        {faq.map((f, i) => (
          <li key={f.id} className="rounded-lg border border-ink/10 bg-paper p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[10px] text-ink/45">#{i + 1}</span>
              <span className="flex gap-0.5">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label={t('aria.moveUp')} title={t('aria.moveUp')}><IconChevronUp size={12} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === faq.length - 1} className={iconBtn} aria-label={t('aria.moveDown')} title={t('aria.moveDown')}><IconChevronDown size={12} /></button>
                <button type="button" onClick={() => remove(i)} className={cn(iconBtn, 'text-stampred')} aria-label={t('aria.remove')} title={t('aria.remove')}><IconTrash size={12} /></button>
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
      <button type="button" onClick={add} className={cn('mt-2 inline-flex items-center gap-1 rounded font-mono text-[11px] text-teal hover:underline', focusRing)}>
        <IconPlus size={12} /> {t('addFaq')}
      </button>
    </Field>
  );
}
