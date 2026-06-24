import { getTranslations } from 'next-intl/server';
import { IconChevronUp, IconChevronDown, IconSelector, IconRefresh, IconHandStop } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDate, fmtInt } from '@/lib/admin/format';
import { paramsOf, mergeParams, type RawSearchParams } from '@/lib/admin/users-query';
import type { SubRow, SubSortKey } from '@/lib/admin/data';
import { SubStatusBadge } from './ui';

const BASE = '/admin/abonnements';

export async function SubTable({
  rows,
  searchParams,
  locale,
}: {
  rows: SubRow[];
  searchParams: RawSearchParams;
  locale: 'ht' | 'fr';
}) {
  const t = await getTranslations('admin.subs');
  const params = paramsOf(searchParams);
  const curSort = params.get('sort') ?? 'renewal';
  const curDir = params.get('dir') ?? (curSort === 'renewal' ? 'asc' : 'desc');

  function SortHeader({ col, label }: { col: SubSortKey; label: string }) {
    const active = curSort === col;
    const nextDir = active && curDir === 'asc' ? 'desc' : 'asc';
    const Icon = !active ? IconSelector : curDir === 'asc' ? IconChevronUp : IconChevronDown;
    return (
      <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">
        <Link href={`${BASE}${mergeParams(params, { sort: col, dir: nextDir })}`} className={cn('inline-flex flex-row-reverse items-center gap-1 hover:text-ink', active && 'text-ink')}>
          {label}
          <Icon size={13} className={active ? 'text-ochre' : 'text-ink/35'} />
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
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead className="bg-paper-light">
          <tr className="border-b border-ink/12 text-left">
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.user')}</th>
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.provider')}</th>
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.started')}</th>
            <SortHeader col="renewal" label={t('col.renewal')} />
            <SortHeader col="mrr" label={t('col.mrr')} />
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-ink/8 last:border-0 hover:bg-ochre/[0.04]">
              <td className="px-3 py-2.5">
                <Link href={`/admin/utilisateurs/${r.userId}`} className="group block min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink group-hover:text-ochre">{r.userName}</span>
                  <span className="block truncate font-mono text-[10px] text-ink/45">{r.userEmail}</span>
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-[13px] text-ink/80">
                  {r.auto ? <IconRefresh size={13} className="text-teal" /> : <IconHandStop size={13} className="text-ochre" />}
                  {t(`provider.${r.provider}`)}
                </span>
                <span className="font-mono text-[10px] uppercase text-ink/40">{r.auto ? t('auto') : t('manual')}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink/70 tabular-nums">{fmtDate(r.startedAt, locale)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs text-ink/70 tabular-nums">{fmtDate(r.currentPeriodEnd, locale)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-sm font-medium text-ink tabular-nums">
                {r.mrrCents > 0 ? fmtUsdCents(r.mrrCents) : '—'}
              </td>
              <td className="px-3 py-2.5">
                <SubStatusBadge status={r.status} label={t(`status.${r.status}`)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
