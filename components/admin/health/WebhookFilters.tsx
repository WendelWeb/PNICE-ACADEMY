'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';
const fieldCls = 'rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink outline-none ' + focusRing;

export function WebhookFilters() {
  const t = useTranslations('admin.health.webhooks');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | null>) =>
    router.push(pathname + mergeParams(new URLSearchParams(sp.toString()), patch));
  const hasFilters = !!get('provider') || !!get('status') || !!get('from') || !!get('to');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={get('provider')} onChange={(e) => push({ provider: e.target.value || null })} aria-label={t('provider')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('providerAll')}</option>
        <option value="card">{t('card')}</option>
        <option value="paypal">PayPal</option>
        <option value="moncash">MonCash</option>
        <option value="natcash">NatCash</option>
        <option value="crypto">Crypto</option>
      </select>
      <select value={get('status')} onChange={(e) => push({ status: e.target.value || null })} aria-label={t('status')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('statusAll')}</option>
        <option value="processed">{t('processed')}</option>
        <option value="failed">{t('failed')}</option>
        <option value="ignored">{t('ignored')}</option>
      </select>
      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
        {t('from')}
        <input type="date" value={get('from')} onChange={(e) => push({ from: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} />
      </label>
      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
        {t('to')}
        <input type="date" value={get('to')} onChange={(e) => push({ to: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} />
      </label>
      {hasFilters && (
        <button type="button" onClick={() => router.push(pathname)} className={cn('flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/5', focusRing)}>
          <IconX size={13} /> {t('clear')}
        </button>
      )}
    </div>
  );
}
