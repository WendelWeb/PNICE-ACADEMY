'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconPlus, IconLoader2, IconEdit, IconTrash, IconX, IconDeviceFloppy } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { createTemplateAction, updateTemplateAction, deleteTemplateAction } from '@/lib/admin/support-actions';
import type { SupportTemplate } from '@/lib/admin/data';

const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';
const labelCls = 'mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55';

type Draft = Omit<SupportTemplate, 'id' | 'createdAt'>;
const empty: Draft = { category: '', title_ht: '', title_fr: '', body_ht: '', body_fr: '' };

export function TemplatesManager({ templates }: { templates: SupportTemplate[] }) {
  const t = useTranslations('admin.support.templates');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // template id or 'new'
  const [draft, setDraft] = useState<Draft>(empty);

  const openNew = () => { setDraft(empty); setEditing('new'); };
  const openEdit = (tpl: SupportTemplate) => {
    setDraft({ category: tpl.category, title_ht: tpl.title_ht, title_fr: tpl.title_fr, body_ht: tpl.body_ht, body_fr: tpl.body_fr });
    setEditing(tpl.id);
  };
  const close = () => { setEditing(null); setDraft(empty); };

  const save = () =>
    start(async () => {
      const r = editing === 'new' ? await createTemplateAction(draft) : await updateTemplateAction(editing!, draft);
      if (r.ok) { close(); router.refresh(); }
    });

  const remove = (id: string) =>
    start(async () => {
      await deleteTemplateAction(id);
      router.refresh();
    });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')} ({templates.length})</h2>
        <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-paper-light hover:bg-ink/90">
          <IconPlus size={14} /> {t('new')}
        </button>
      </div>

      <ul className="space-y-2">
        {templates.map((tpl) => (
          <li key={tpl.id} className="flex items-start justify-between gap-3 rounded-xl border border-ink/12 bg-paper-light p-3">
            <div className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink/55">{tpl.category}</span>
                <span className="text-sm font-medium text-ink">{tpl.title_fr}</span>
              </span>
              <p className="mt-1 line-clamp-2 text-xs text-graphite/65">{tpl.body_fr}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => openEdit(tpl)} className="rounded-lg border border-ink/15 p-1.5 text-ink/60 hover:bg-ink/[0.04]" aria-label={t('edit')}><IconEdit size={14} /></button>
              <button type="button" onClick={() => remove(tpl.id)} disabled={pending} className="rounded-lg border border-stampred/30 p-1.5 text-stampred hover:bg-stampred/5" aria-label={t('delete')}><IconTrash size={14} /></button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{editing === 'new' ? t('new') : t('edit')}</h3>
              <button type="button" onClick={close} className="text-ink/50 hover:text-ink"><IconX size={18} /></button>
            </div>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className={labelCls}>{t('category')}</span>
                <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="compte / paiement / formation" className={inputCls} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={labelCls}>{t('titleHt')}</span><input value={draft.title_ht} onChange={(e) => setDraft({ ...draft, title_ht: e.target.value })} className={inputCls} /></label>
                <label className="block"><span className={labelCls}>{t('titleFr')}</span><input value={draft.title_fr} onChange={(e) => setDraft({ ...draft, title_fr: e.target.value })} className={inputCls} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={labelCls}>{t('bodyHt')}</span><textarea value={draft.body_ht} onChange={(e) => setDraft({ ...draft, body_ht: e.target.value })} className={cn(inputCls, 'min-h-[120px] resize-y')} /></label>
                <label className="block"><span className={labelCls}>{t('bodyFr')}</span><textarea value={draft.body_fr} onChange={(e) => setDraft({ ...draft, body_fr: e.target.value })} className={cn(inputCls, 'min-h-[120px] resize-y')} /></label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={close} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('cancel')}</button>
              <button type="button" disabled={pending || !draft.title_fr.trim() || !draft.body_fr.trim()} onClick={save} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconDeviceFloppy size={14} />} {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
