import { getTranslations } from 'next-intl/server';
import { IconChevronUp, IconChevronDown, IconSelector } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDate, fmtInt } from '@/lib/admin/format';
import { spToParams, mergeParams, type RawSearchParams } from '@/lib/admin/users-query';
import type { UserRow, UserSortKey } from '@/lib/admin/data';
import { TypeBadge, StatusBadge, CountryBadge } from './ui';

const BASE = '/admin/utilisateurs';

export async function UsersTable({
  rows,
  searchParams,
  locale,
}: {
  rows: UserRow[];
  searchParams: RawSearchParams;
  locale: 'ht' | 'fr';
}) {
  const t = await getTranslations('admin.users');
  const params = spToParams(searchParams);
  const curSort = params.get('sort') ?? 'createdAt';
  const curDir = params.get('dir') ?? 'desc';

  function SortHeader({ col, label, num }: { col: UserSortKey; label: string; num?: boolean }) {
    const isActive = curSort === col;
    const nextDir = isActive && curDir === 'desc' ? 'asc' : 'desc';
    const Icon = !isActive ? IconSelector : curDir === 'desc' ? IconChevronDown : IconChevronUp;
    return (
      <th className={cn('px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55', num && 'text-right')}>
        <Link
          href={`${BASE}${mergeParams(params, { sort: col, dir: nextDir })}`}
          className={cn(
            'inline-flex items-center gap-1 hover:text-ink',
            num && 'flex-row-reverse',
            isActive && 'text-ink',
          )}
        >
          {label}
          <Icon size={13} className={isActive ? 'text-ochre' : 'text-ink/35'} />
        </Link>
      </th>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-ink/12">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <thead className="bg-paper-light">
          <tr className="border-b border-ink/12 text-left">
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">
              {t('col.user')}
            </th>
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">
              {t('col.contact')}
            </th>
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">
              {t('col.location')}
            </th>
            <SortHeader col="createdAt" label={t('col.joined')} />
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">
              {t('col.status')}
            </th>
            <SortHeader col="totalSpent" label={t('col.spent')} num />
            <SortHeader col="lastActive" label={t('col.lastActive')} num />
            <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">
              {t('col.lastPayment')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-ink/8 transition-colors last:border-0 hover:bg-ochre/[0.04] motion-reduce:transition-none"
            >
              <td className="px-3 py-2.5">
                <Link href={`${BASE}/${r.id}`} className="flex items-center gap-2.5 group">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/8 font-mono text-xs font-medium text-ink/60">
                    {r.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink group-hover:text-ochre">
                      {r.name}
                    </span>
                    <span className="block font-mono text-[10px] text-ink/40">{r.id}</span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <span className="block truncate text-[13px] text-ink/80">{r.email}</span>
                <span className="block font-mono text-[11px] text-ink/45">{r.phone}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-1.5">
                  <CountryBadge country={r.country} label={t(`country.${r.country}`)} />
                  <span className="font-mono text-[10px] uppercase text-ink/40">{r.language}</span>
                </span>
                <span className="block text-[11px] text-ink/50">{r.city}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink/70 tabular-nums">
                {fmtDate(r.createdAt, locale)}
              </td>
              <td className="px-3 py-2.5">
                <span className="flex flex-col items-start gap-1">
                  <TypeBadge type={r.type} label={t(`types.${r.type}`)} />
                  {r.status !== 'active' && (
                    <StatusBadge status={r.status} label={t(`status.${r.status}`)} />
                  )}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-sm font-medium text-ink tabular-nums">
                {fmtUsdCents(r.totalSpentCents)}
                <span className="block text-[10px] font-normal text-ink/40">
                  {fmtInt(r.coursesAccess)} {t('coursesShort')}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs text-ink/70 tabular-nums">
                {fmtDate(r.lastActiveAt, locale)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs text-ink/70 tabular-nums">
                {fmtDate(r.lastPaymentAt, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
