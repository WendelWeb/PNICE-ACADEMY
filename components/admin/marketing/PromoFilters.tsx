'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconSearch, IconX, IconArrowsSort } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const fieldCls =
  'rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink outline-none ' + focusRing;

export function PromoFilters() {
  const t = useTranslations('admin.marketing.promos');
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

  const sort = get('sort') || 'expiry';
  const dir = get('dir') || 'asc';
  const hasFilters = !!get('q') || !!get('status') || !!get('type') || !!get('sort') || !!get('dir');

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
        <option value="scheduled">{t('status.scheduled')}</option>
        <option value="expired">{t('status.expired')}</option>
        <option value="depleted">{t('status.depleted')}</option>
        <option value="disabled">{t('status.disabled')}</option>
      </select>

      <select value={get('type')} onChange={(e) => push({ type: e.target.value || null })} aria-label={t('filters.type')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('filters.typeAll')}</option>
        <option value="percent">{t('type.percent')}</option>
        <option value="fixed">{t('type.fixed')}</option>
      </select>

      <select value={sort} onChange={(e) => push({ sort: e.target.value })} aria-label={t('filters.sort')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="expiry">{t('filters.sortExpiry')}</option>
        <option value="usage">{t('filters.sortUsage')}</option>
      </select>
      <button
        type="button"
        onClick={() => push({ dir: dir === 'asc' ? 'desc' : 'asc' })}
        aria-label={t('filters.dir')}
        title={dir === 'asc' ? '↑' : '↓'}
        className={cn('flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-ink/70 hover:bg-ink/[0.04]', focusRing)}
      >
        <IconArrowsSort size={13} /> {dir === 'asc' ? '↑' : '↓'}
      </button>

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className={cn('flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/5', focusRing)}
        >
          <IconX size={13} /> {t('filters.clear')}
        </button>
      )}
    </div>
  );
}
