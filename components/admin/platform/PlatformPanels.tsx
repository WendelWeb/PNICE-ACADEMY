'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCreditCard, IconReceipt2, IconTool, IconLoader2, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { toggleProviderAction, setSubscriptionPriceAction, setMaintenanceAction } from '@/lib/admin/platform-actions';
import { PROVIDER_KEYS, type ProviderKey } from '@/lib/admin/platform/store';

const inputCls = 'rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function ProvidersPanel({ providers }: { providers: Record<ProviderKey, boolean> }) {
  const t = useTranslations('admin.platform.providers');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const toggle = (k: ProviderKey, on: boolean) => start(async () => {
    setErr(null);
    const r = await toggleProviderAction(k, on);
    if (r.ok) router.refresh();
    else setErr(r.message === 'last_provider' ? t('lastWarn') : t('error'));
  });

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55"><IconCreditCard size={13} /> {t('title')}</h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('note')}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {PROVIDER_KEYS.map((k) => (
          <li key={k} className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2">
            <span className="text-[13px] text-ink/85">{t(`name.${k}`)}</span>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={providers[k]} disabled={pending} onChange={(e) => toggle(k, e.target.checked)} className="h-4 w-4 accent-teal" />
              <span className={cn('font-mono text-[10px] uppercase', providers[k] ? 'text-teal' : 'text-ink/40')}>{providers[k] ? t('on') : t('off')}</span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="mt-2 font-mono text-[11px] text-stampred">{err}</p>}
    </section>
  );
}

export function SubscriptionPricePanel({ usd }: { usd: number }) {
  const t = useTranslations('admin.platform.subprice');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(String(usd));
  const [saved, setSaved] = useState(false);

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55"><IconReceipt2 size={13} /> {t('title')}</h2>
      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-graphite/70"><IconAlertTriangle size={13} className="mt-0.5 shrink-0 text-ochre" /> {t('warn')}</p>
      <div className="mt-3 flex items-end gap-2">
        <label className="flex flex-col gap-1"><span className="font-mono text-[10px] uppercase text-ink/45">{t('price')}</span><span className="flex items-center gap-1 font-mono text-sm text-ink/55">$<input type="number" min="1" value={val} onChange={(e) => { setVal(e.target.value); setSaved(false); }} className={cn(inputCls, 'w-24')} />/{t('month')}</span></label>
        <button type="button" disabled={pending} onClick={() => start(async () => { if ((await setSubscriptionPriceAction(Number(val))).ok) { setSaved(true); router.refresh(); } })} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>{pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('save')}</button>
        {saved && <span className="pb-2 font-mono text-[11px] text-teal">{t('saved')}</span>}
      </div>
    </section>
  );
}

export function MaintenancePanel({ enabled, messageHt, messageFr }: { enabled: boolean; messageHt: string; messageFr: string }) {
  const t = useTranslations('admin.platform.maintenance');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  const [ht, setHt] = useState(messageHt);
  const [fr, setFr] = useState(messageFr);
  const [saved, setSaved] = useState(false);

  const save = (nextOn: boolean) => start(async () => { if ((await setMaintenanceAction(nextOn, ht, fr)).ok) { setOn(nextOn); setSaved(true); router.refresh(); } });

  return (
    <section className={cn('rounded-xl border p-4', on ? 'border-stampred/40 bg-stampred/[0.04]' : 'border-ink/12 bg-paper-light')}>
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55"><IconTool size={13} /> {t('title')}</h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/70">{t('note')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <textarea value={ht} onChange={(e) => { setHt(e.target.value); setSaved(false); }} placeholder={t('messageHt')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
        <textarea value={fr} onChange={(e) => { setFr(e.target.value); setSaved(false); }} placeholder={t('messageFr')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {on ? (
          <button type="button" disabled={pending} onClick={() => save(false)} className={cn(buttonClasses('dark', 'md'), 'text-xs')}>{pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('disable')}</button>
        ) : (
          <button type="button" disabled={pending} onClick={() => save(true)} className="flex items-center gap-1.5 rounded bg-stampred px-4 py-2.5 text-xs font-semibold text-paper-light">{pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconTool size={15} />} {t('enable')}</button>
        )}
        <button type="button" disabled={pending} onClick={() => start(async () => { if ((await setMaintenanceAction(on, ht, fr)).ok) { setSaved(true); router.refresh(); } })} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('saveMessage')}</button>
        {on && <span className="font-mono text-[11px] font-medium text-stampred">{t('activeNow')}</span>}
        {saved && <span className="font-mono text-[11px] text-teal">{t('saved')}</span>}
      </div>
    </section>
  );
}
