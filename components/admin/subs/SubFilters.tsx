'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconSearch, IconX, IconAlertTriangle, IconCalendarClock } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const fieldCls =
  'rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink outline-none ' +
  focusRing;

export function SubFilters({ counts }: { counts: { past_due: number; renew7: number } }) {
  const t = useTranslations('admin.subs');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | number | null>) =>
    router.push(pathname + mergeParams(new URLSearchParams(sp.toString()), patch));

  const [search, setSearch] = useState(get('q'));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => {
      if (search !== get('q')) push({ q: search || null });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const segment = get('segment');
  const hasFilters =
    !!get('q') || !!get('status') || !!get('provider') || !!get('from') || !!get('to') || !!segment;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filters.searchPlaceholder')}
          aria-label={t('filters.search')}
          className={cn(fieldCls, 'w-52 pl-8')}
        />
      </div>

      <select value={get('status')} onChange={(e) => push({ status: e.target.value || null })} aria-label={t('filters.status')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('filters.statusAll')}</option>
        <option value="active">{t('status.active')}</option>
        <option value="past_due">{t('status.past_due')}</option>
        <option value="canceled">{t('status.canceled')}</option>
      </select>

      <select value={get('provider')} onChange={(e) => push({ provider: e.target.value || null })} aria-label={t('filters.provider')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('filters.providerAll')}</option>
        <option value="card">{t('provider.card')}</option>
        <option value="paypal">PayPal</option>
        <option value="moncash">MonCash</option>
        <option value="natcash">NatCash</option>
        <option value="crypto">Crypto</option>
      </select>

      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
        {t('filters.from')}
        <input type="date" value={get('from')} onChange={(e) => push({ from: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} />
      </label>
      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
        {t('filters.to')}
        <input type="date" value={get('to')} onChange={(e) => push({ to: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} />
      </label>

      <Toggle active={segment === 'renew7'} onClick={() => push({ segment: segment === 'renew7' ? null : 'renew7' })}>
        <IconCalendarClock size={13} />
        {t('filters.renew7')}
        <Count n={counts.renew7} active={segment === 'renew7'} />
      </Toggle>
      <Toggle active={segment === 'dunning'} onClick={() => push({ segment: segment === 'dunning' ? null : 'dunning' })}>
        <IconAlertTriangle size={13} />
        {t('filters.dunning')}
        <Count n={counts.past_due} active={segment === 'dunning'} />
      </Toggle>

      {hasFilters && (
        <button type="button" onClick={() => router.push(pathname)} className={cn('flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/5', focusRing)}>
          <IconX size={13} />
          {t('filters.clear')}
        </button>
      )}
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors motion-reduce:transition-none',
        focusRing,
        active ? 'border-ochre bg-ochre/15 text-ink' : 'border-ink/15 text-ink/70 hover:bg-ink/[0.04]',
      )}
    >
      {children}
    </button>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span className={cn('rounded px-1.5 font-mono text-[10px] tabular-nums', active ? 'bg-ochre/30' : 'bg-ink/8')}>
      {n}
    </span>
  );
}
