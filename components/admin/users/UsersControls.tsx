'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconSearch, IconX, IconFlame, IconClockPause, IconDownload } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const fieldCls =
  'rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink outline-none ' +
  focusRing;

export function UsersControls({ exportHref }: { exportHref: string }) {
  const t = useTranslations('admin.users.filters');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const get = (k: string) => sp.get(k) ?? '';
  const push = (patch: Record<string, string | number | null>) =>
    router.push(pathname + mergeParams(new URLSearchParams(sp.toString()), patch));

  // Debounced search.
  const [search, setSearch] = useState(get('q'));
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = setTimeout(() => {
      if (search !== get('q')) push({ q: search || null });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters =
    !!get('q') || !!get('country') || !!get('lang') || !!get('courses') ||
    !!get('from') || !!get('to') || !!get('segment') || !!get('type');

  const segment = get('segment');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <IconSearch
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className={cn(fieldCls, 'w-56 pl-8')}
          />
        </div>

        {/* Country */}
        <select
          value={get('country')}
          onChange={(e) => push({ country: e.target.value || null })}
          aria-label={t('country')}
          className={cn(fieldCls, 'cursor-pointer')}
        >
          <option value="">{t('countryAll')}</option>
          <option value="HT">{t('countryHt')}</option>
          <option value="diaspora">{t('countryDiaspora')}</option>
        </select>

        {/* Language */}
        <select
          value={get('lang')}
          onChange={(e) => push({ lang: e.target.value || null })}
          aria-label={t('language')}
          className={cn(fieldCls, 'cursor-pointer')}
        >
          <option value="">{t('langAll')}</option>
          <option value="ht">Kreyòl</option>
          <option value="fr">Français</option>
        </select>

        {/* Courses bucket */}
        <select
          value={get('courses')}
          onChange={(e) => push({ courses: e.target.value || null })}
          aria-label={t('courses')}
          className={cn(fieldCls, 'cursor-pointer')}
        >
          <option value="">{t('coursesAll')}</option>
          <option value="0">{t('courses0')}</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5plus">5+</option>
        </select>

        {/* Date range */}
        <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
          {t('from')}
          <input
            type="date"
            value={get('from')}
            onChange={(e) => push({ from: e.target.value || null })}
            className={cn(fieldCls, 'cursor-pointer')}
          />
        </label>
        <label className="flex items-center gap-1 font-mono text-[11px] text-ink/55">
          {t('to')}
          <input
            type="date"
            value={get('to')}
            onChange={(e) => push({ to: e.target.value || null })}
            className={cn(fieldCls, 'cursor-pointer')}
          />
        </label>

        {hasFilters && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className={cn(
              'flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/5',
              focusRing,
            )}
          >
            <IconX size={13} />
            {t('clear')}
          </button>
        )}
      </div>

      {/* Special segments + export */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
          {t('quickViews')}
        </span>
        <SegBtn
          active={segment === 'inactive'}
          onClick={() => push({ segment: segment === 'inactive' ? null : 'inactive' })}
        >
          <IconClockPause size={13} />
          {t('inactive')}
        </SegBtn>
        <SegBtn
          active={segment === 'top_spenders'}
          onClick={() => push({ segment: segment === 'top_spenders' ? null : 'top_spenders' })}
        >
          <IconFlame size={13} />
          {t('topSpenders')}
        </SegBtn>

        <a
          href={exportHref}
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-paper-light hover:bg-ink/90',
            focusRing,
          )}
        >
          <IconDownload size={14} />
          {t('exportCsv')}
        </a>
      </div>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors motion-reduce:transition-none',
        focusRing,
        active
          ? 'border-ochre bg-ochre/15 text-ink'
          : 'border-ink/15 text-ink/70 hover:bg-ink/[0.04]',
      )}
    >
      {children}
    </button>
  );
}
