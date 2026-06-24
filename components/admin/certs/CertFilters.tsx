'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconSearch, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const fieldCls =
  'rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1.5 font-mono text-xs text-ink outline-none ' + focusRing;

export function CertFilters({ courses }: { courses: { slug: string; title: string }[] }) {
  const t = useTranslations('admin.certs.filters');
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

  const hasFilters = !!get('q') || !!get('course') || !!get('state');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} className={cn(fieldCls, 'w-56 pl-8')} />
      </div>
      <select value={get('course')} onChange={(e) => push({ course: e.target.value || null })} aria-label={t('course')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('courseAll')}</option>
        {courses.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.title}
          </option>
        ))}
      </select>
      <select value={get('state')} onChange={(e) => push({ state: e.target.value || null })} aria-label={t('state')} className={cn(fieldCls, 'cursor-pointer')}>
        <option value="">{t('stateAll')}</option>
        <option value="valid">{t('stateValid')}</option>
        <option value="revoked">{t('stateRevoked')}</option>
      </select>
      {hasFilters && (
        <button type="button" onClick={() => router.push(pathname)} className={cn('flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1.5 font-mono text-[11px] text-stampred hover:bg-stampred/5', focusRing)}>
          <IconX size={13} />
          {t('clear')}
        </button>
      )}
    </div>
  );
}
