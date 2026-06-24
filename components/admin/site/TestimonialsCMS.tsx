'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconPlus, IconPencil, IconTrash, IconWorldUpload, IconWorldOff, IconAlertTriangle, IconLoader2, IconX,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import {
  createTestimonialAction, updateTestimonialAction, deleteTestimonialAction,
  publishTestimonialAction, unpublishTestimonialAction,
} from '@/lib/admin/site-actions';
import type { SiteTestimonial } from '@/lib/admin/site/store';

const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

type Draft = { id?: string; name: string; location: string; courseSlug: string; quote_ht: string; quote_fr: string; photo: string };
const blank: Draft = { name: '', location: '', courseSlug: '', quote_ht: '', quote_fr: '', photo: '' };

export function TestimonialsCMS({ items, courses }: { items: SiteTestimonial[]; courses: { slug: string; title: string }[] }) {
  const t = useTranslations('admin.testimonials');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState('');
  const [course, setCourse] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);

  const filtered = items.filter((x) => (!status || x.status === status) && (!course || x.courseSlug === course));
  const act = (fn: () => Promise<{ ok: boolean }>) => start(async () => { if ((await fn()).ok) router.refresh(); });

  const save = () => {
    if (!edit) return;
    const payload = { name: edit.name, location: edit.location, courseSlug: edit.courseSlug || null, quote_ht: edit.quote_ht, quote_fr: edit.quote_fr, photo: edit.photo || null };
    start(async () => {
      const res = edit.id ? await updateTestimonialAction(edit.id, payload) : await createTestimonialAction(payload);
      if (res.ok) { setEdit(null); router.refresh(); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(inputCls, 'w-auto cursor-pointer')}>
          <option value="">{t('filterStatus')}</option>
          <option value="placeholder">{t('status.placeholder')}</option>
          <option value="real">{t('status.real')}</option>
          <option value="published">{t('status.published')}</option>
        </select>
        <select value={course} onChange={(e) => setCourse(e.target.value)} className={cn(inputCls, 'w-auto cursor-pointer')}>
          <option value="">{t('filterCourse')}</option>
          {courses.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
        </select>
        <button type="button" onClick={() => setEdit({ ...blank })} className={cn('ml-auto', buttonClasses('dark', 'md'), 'text-xs')}>
          <IconPlus size={15} /> {t('new')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink/12">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-paper-light">
            <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
              <th className="px-3 py-2">{t('col.name')}</th>
              <th className="px-3 py-2">{t('col.quote')}</th>
              <th className="px-3 py-2">{t('col.status')}</th>
              <th className="px-3 py-2 text-right">{t('col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => {
              const canPublish = x.status === 'real' && !!x.quote_ht.trim() && !!x.quote_fr.trim();
              return (
                <tr key={x.id} className={cn('border-b border-ink/8 last:border-0', x.status === 'placeholder' && 'bg-stampred/[0.04]')}>
                  <td className="px-3 py-2.5">
                    <span className="block text-[13px] font-medium text-ink">{x.name}</span>
                    <span className="block font-mono text-[10px] text-ink/45">{x.location || '—'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink/70">{(x.quote_fr || x.quote_ht).slice(0, 80)}{(x.quote_fr || x.quote_ht).length > 80 ? '…' : ''}</td>
                  <td className="px-3 py-2.5">
                    {x.status === 'placeholder' ? (
                      <span className="inline-flex items-center gap-1 rounded bg-stampred/12 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-stampred">
                        <IconAlertTriangle size={11} /> {t('neverPublish')}
                      </span>
                    ) : (
                      <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase', x.status === 'published' ? 'bg-teal/12 text-teal' : 'bg-ochre/15 text-ochre')}>
                        {t(`status.${x.status}`)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-2">
                      {x.status !== 'placeholder' && (
                        <button type="button" disabled={pending} onClick={() => setEdit({ id: x.id, name: x.name, location: x.location, courseSlug: x.courseSlug ?? '', quote_ht: x.quote_ht, quote_fr: x.quote_fr, photo: x.photo ?? '' })} className="font-mono text-[11px] text-ink/60 hover:text-ink"><IconPencil size={13} /></button>
                      )}
                      {x.status === 'published' ? (
                        <button type="button" disabled={pending} onClick={() => act(() => unpublishTestimonialAction(x.id))} className="inline-flex items-center gap-1 font-mono text-[11px] text-ochre hover:underline"><IconWorldOff size={12} /> {t('unpublish')}</button>
                      ) : canPublish ? (
                        <button type="button" disabled={pending} onClick={() => act(() => publishTestimonialAction(x.id))} className="inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline"><IconWorldUpload size={12} /> {t('publish')}</button>
                      ) : null}
                      {x.status !== 'placeholder' && (
                        <button type="button" disabled={pending} onClick={() => act(() => deleteTestimonialAction(x.id))} className="font-mono text-[11px] text-stampred hover:underline"><IconTrash size={12} /></button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{edit.id ? t('editTitle') : t('new')}</h3>
              <button type="button" onClick={() => setEdit(null)} className="text-ink/50 hover:text-ink"><IconX size={18} /></button>
            </div>
            <div className="mt-3 space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t('col.name')} className={inputCls} />
                <input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder={t('location')} className={inputCls} />
              </div>
              <select value={edit.courseSlug} onChange={(e) => setEdit({ ...edit, courseSlug: e.target.value })} className={cn(inputCls, 'cursor-pointer')}>
                <option value="">{t('noCourse')}</option>
                {courses.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
              </select>
              <textarea value={edit.quote_ht} onChange={(e) => setEdit({ ...edit, quote_ht: e.target.value })} placeholder={t('quoteHt')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
              <textarea value={edit.quote_fr} onChange={(e) => setEdit({ ...edit, quote_fr: e.target.value })} placeholder={t('quoteFr')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
              <input value={edit.photo} onChange={(e) => setEdit({ ...edit, photo: e.target.value })} placeholder={t('photoUrl')} className={inputCls} />
              <p className="font-mono text-[10px] text-ink/45">{t('bothLangsNote')}</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEdit(null)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('cancel')}</button>
              <button type="button" disabled={pending || !edit.name.trim()} onClick={save} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
