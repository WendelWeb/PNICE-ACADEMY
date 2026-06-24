'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconSearch, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';
const fieldCls = 'rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink outline-none ' + focusRing;

export function TicketFilters() {
  const t = useTranslations('admin.support');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | null>) =>
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

  const hasFilters = !!get('q') || !!get('status') || !!get('type') || !!get('from') || !!get('to');

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
          className={cn(fieldCls, 'w-56 pl-8')}
        />
      </div>
      <select value={get('status')} onChange={(e) => push({ status: e.target.value || null })} aria-label={t('filters.status')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('filters.statusAll')}</option>
        <option value="open">{t('status.open')}</option>
        <option value="in_progress">{t('status.in_progress')}</option>
        <option value="resolved">{t('status.resolved')}</option>
      </select>
      <select value={get('type')} onChange={(e) => push({ type: e.target.value || null })} aria-label={t('filters.type')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('filters.typeAll')}</option>
        <option value="question">{t('type.question')}</option>
        <option value="bug">{t('type.bug')}</option>
        <option value="refund">{t('type.refund')}</option>
      </select>
      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
        {t('filters.from')}
        <input type="date" value={get('from')} onChange={(e) => push({ from: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} />
      </label>
      <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
        {t('filters.to')}
        <input type="date" value={get('to')} onChange={(e) => push({ to: e.target.value || null })} className={cn(fieldCls, 'cursor-pointer')} />
      </label>
      {hasFilters && (
        <button type="button" onClick={() => router.push(pathname)} className={cn('flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/5', focusRing)}>
          <IconX size={13} /> {t('filters.clear')}
        </button>
      )}
    </div>
  );
}
