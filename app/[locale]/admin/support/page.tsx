import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconChevronRight, IconTemplate, IconUserOff } from '@tabler/icons-react';
import { getTickets } from '@/lib/admin/data';
import { parseTicketQuery } from '@/lib/admin/support-query';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { TicketFilters } from '@/components/admin/support/TicketFilters';
import { TicketStatusBadge, TicketTypeBadge } from '@/components/admin/support/ui';
import { Pagination } from '@/components/admin/users/Pagination';
import { Link } from '@/i18n/routing';
import { fmtDate, fmtDateTime, fmtInt } from '@/lib/admin/format';
import type { RawSearchParams } from '@/lib/admin/users-query';

export const dynamic = 'force-dynamic';

export default async function SupportPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('support.read'))) return <Forbidden />;
  const t = await getTranslations('admin.support');
  const data = await getTickets(parseTicketQuery(searchParams));

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <Link href="/admin/support/modeles" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/70 hover:bg-ink/[0.04]">
          <IconTemplate size={14} /> {t('templates.link')}
        </Link>
      </div>

      {/* counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['open', data.counts.open, 'stampred'],
          ['in_progress', data.counts.in_progress, 'ochre'],
          ['resolved', data.counts.resolved, 'teal'],
          ['unassignedOpen', data.counts.unassignedOpen, 'ink'],
        ] as const).map(([key, value, tone]) => (
          <div key={key} className="rounded-xl border border-ink/12 bg-paper-light p-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink/55">{t(`counts.${key}`)}</p>
            <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tone === 'stampred' ? 'text-stampred' : tone === 'ochre' ? 'text-ochre' : tone === 'teal' ? 'text-teal' : 'text-ink'}`}>{fmtInt(value)}</p>
          </div>
        ))}
      </div>

      <TicketFilters />

      <div className="overflow-x-auto rounded-xl border border-ink/12 bg-paper-light">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
              <th className="px-3 py-2">{t('col.user')}</th>
              <th className="px-3 py-2">{t('col.type')}</th>
              <th className="px-3 py-2">{t('col.subject')}</th>
              <th className="px-3 py-2">{t('col.status')}</th>
              <th className="px-3 py-2">{t('col.assigned')}</th>
              <th className="px-3 py-2">{t('col.updated')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center font-mono text-xs text-graphite/55">{t('empty')}</td></tr>
            )}
            {data.rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/8 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-3 py-2.5">
                  <Link href={`/admin/support/${r.id}`} className="text-[13px] font-medium text-ink hover:text-ochre">{r.userName}</Link>
                  <span className="block font-mono text-[10px] text-ink/45">{r.userEmail}</span>
                </td>
                <td className="px-3 py-2.5"><TicketTypeBadge type={r.type} label={t(`type.${r.type}`)} /></td>
                <td className="px-3 py-2.5 max-w-[260px]">
                  <Link href={`/admin/support/${r.id}`} className="block truncate text-[13px] text-ink/80 hover:text-ochre">{r.subject}</Link>
                  <span className="font-mono text-[10px] text-ink/40">{fmtDate(r.createdAt, locale)}</span>
                </td>
                <td className="px-3 py-2.5"><TicketStatusBadge status={r.status} label={t(`status.${r.status}`)} /></td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-ink/65">
                  {r.assignedAdminName ?? <span className="flex items-center gap-1 text-ink/35"><IconUserOff size={12} /> {t('detail.unassigned')}</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-ink/55 tabular-nums">{fmtDateTime(r.updatedAt, locale)}</td>
                <td className="px-3 py-2.5 text-right"><Link href={`/admin/support/${r.id}`} className="text-ochre"><IconChevronRight size={16} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={data.total} page={data.page} pageSize={data.pageSize} searchParams={searchParams} base="/admin/support" />
    </div>
  );
}
