'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconDeviceFloppy, IconLoader2, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { updateCourseAction } from '@/lib/admin/content-actions';
import type { AdminCourse, CoursePatch } from '@/lib/courses/write';
import { BilingualText, PairedList, FaqEditor, inputCls, type FaqItem } from './fields';

type UpdateResult = { ok: boolean; message?: string };
/** Same shape as `lib/admin/content-actions.ts`'s `updateCourseAction` — the
 *  studio (Task C3-T4) passes its own owner-scoped action here instead. */
type UpdateAction = (slug: string, patch: CoursePatch) => Promise<UpdateResult>;

const ICON_KEYS = [
  'credit-card', 'shopping-cart', 'ship', 'speakerphone', 'palette',
  'brand-whatsapp', 'device-mobile-code', 'shield-lock', 'player-play', 'book',
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CourseEditor({
  course,
  salesCount,
  priciest,
  updateAction = updateCourseAction,
}: {
  course: AdminCourse;
  salesCount: number;
  priciest: { code: string; priceCents: number } | null;
  /** Injected by the teacher studio (Task C3-T4) as the owner-scoped
   *  `updateMyCourseAction`; defaults to the admin CMS action so every
   *  existing `/admin/cours/[slug]/editer` call site is unchanged. */
  updateAction?: UpdateAction;
}) {
  const t = useTranslations('admin.cms.editor');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [save, setSave] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [c, setC] = useState(course);
  const [priceDollars, setPriceDollars] = useState(String(Math.round(course.priceCents / 100)));

  const set = <K extends keyof AdminCourse>(k: K, v: AdminCourse[K]) => {
    setC((prev) => ({ ...prev, [k]: v }));
    setSave('idle');
  };

  const newPriceCents = Math.round((Number(priceDollars) || 0) * 100);
  const projectedRevenue = newPriceCents * salesCount;
  const overMax = priciest && newPriceCents > priciest.priceCents && course.code !== priciest.code;

  const onSave = () =>
    start(async () => {
      setSave('saving');
      setSaveMessage(null);
      const res = await updateAction(course.slug, {
        icon: c.icon,
        title_ht: c.title_ht, title_fr: c.title_fr,
        tagline_ht: c.tagline_ht, tagline_fr: c.tagline_fr,
        audience_ht: c.audience_ht, audience_fr: c.audience_fr,
        learn_ht: c.learn_ht, learn_fr: c.learn_fr,
        priceCents: newPriceCents,
        level_ht: c.level_ht, level_fr: c.level_fr,
        promise_ht: c.promise_ht, promise_fr: c.promise_fr,
        problem_ht: c.problem_ht, problem_fr: c.problem_fr,
        deliverables_ht: c.deliverables_ht, deliverables_fr: c.deliverables_fr,
        requirements_ht: c.requirements_ht, requirements_fr: c.requirements_fr,
        faq: c.faq,
        // Course-level links/downloads ("liens en description") moved to
        // their own "Ressources" tab (Task A2) — see CourseResourcesPanel.
      });
      setSave(res.ok ? 'saved' : 'error');
      if (res.ok) router.refresh();
      else setSaveMessage(res.message ?? null);
    });

  return (
    <div className="space-y-4">
      {/* General + price */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('general')}</h2>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('code')}><input value={c.code} disabled className={cn(inputCls, 'opacity-60')} /></Field>
            <Field label={t('slug')}><input value={c.slug} disabled className={cn(inputCls, 'opacity-60')} /></Field>
            <Field label={t('icon')}>
              <select value={c.icon} onChange={(e) => set('icon', e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
                {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
          </div>
          <BilingualText label={t('title')} ht={c.title_ht} fr={c.title_fr} onHt={(v) => set('title_ht', v)} onFr={(v) => set('title_fr', v)} />
          <BilingualText label={t('tagline')} ht={c.tagline_ht} fr={c.tagline_fr} onHt={(v) => set('tagline_ht', v)} onFr={(v) => set('tagline_fr', v)} />
          <BilingualText label={t('audience')} area ht={c.audience_ht} fr={c.audience_fr} onHt={(v) => set('audience_ht', v)} onFr={(v) => set('audience_fr', v)} />
          <PairedList label={t('learn')} ht={c.learn_ht} fr={c.learn_fr} onChange={(ht, fr) => { set('learn_ht', ht); set('learn_fr', fr); }} />

          {/* Price + impact (task 3) */}
          <Field label={t('price')}>
            <span className="flex items-center gap-1 font-mono text-sm text-ink/55">$<input type="number" min="0" value={priceDollars} onChange={(e) => { setPriceDollars(e.target.value); setSave('idle'); }} className={cn(inputCls, 'w-24')} /></span>
          </Field>
          <div className="rounded-lg bg-paper p-3 text-xs">
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('impact')}</p>
            <p className="mt-1 text-graphite/80">
              {t('impactRevenue', { count: salesCount, revenue: '$' + Math.round(projectedRevenue / 100).toLocaleString('en-US') })}
            </p>
            {overMax && (
              <p className="mt-1.5 flex items-center gap-1 text-stampred">
                <IconAlertTriangle size={13} /> {t('impactWarn', { code: priciest!.code })}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Sales page (task 4) */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('salesPage')}</h2>
        <div className="mt-3 space-y-3">
          <BilingualText label={t('level')} ht={c.level_ht} fr={c.level_fr} onHt={(v) => set('level_ht', v)} onFr={(v) => set('level_fr', v)} />
          <BilingualText label={t('promise')} area ht={c.promise_ht} fr={c.promise_fr} onHt={(v) => set('promise_ht', v)} onFr={(v) => set('promise_fr', v)} />
          <BilingualText label={t('problem')} area ht={c.problem_ht} fr={c.problem_fr} onHt={(v) => set('problem_ht', v)} onFr={(v) => set('problem_fr', v)} />
          <PairedList label={t('deliverables')} ht={c.deliverables_ht} fr={c.deliverables_fr} onChange={(ht, fr) => { set('deliverables_ht', ht); set('deliverables_fr', fr); }} />
          <PairedList label={t('requirements')} ht={c.requirements_ht} fr={c.requirements_fr} onChange={(ht, fr) => { set('requirements_ht', ht); set('requirements_fr', fr); }} />
          <FaqEditor faq={c.faq as FaqItem[]} onChange={(f) => set('faq', f)} />
        </div>
      </section>

      {/* Save bar — deliberately NOT sticky (Task A2 consolidates the whole
          editor page to a SINGLE sticky bar, the status/readiness/publish
          bar rendered once by the page itself, outside any one tab). */}
      <div className="flex items-center gap-3 rounded-xl border border-ink/12 bg-paper-light px-4 py-2.5">
        <button type="button" disabled={pending} onClick={onSave} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
          {save === 'saving' ? <IconLoader2 size={15} className="animate-spin" /> : <IconDeviceFloppy size={15} />}
          {t('save')}
        </button>
        <span
          className={cn(
            'font-mono text-[11px]',
            save === 'saved' ? 'text-teal' : save === 'error' ? 'text-stampred' : 'text-ink/45',
          )}
          role="status"
        >
          {save === 'saved' ? t('saved') : save === 'error' ? t('error') : save === 'saving' ? t('saving') : t('unsaved')}
        </span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{label}</span>
      {children}
    </label>
  );
}
