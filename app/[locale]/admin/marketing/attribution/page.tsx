import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconChartArrows } from '@tabler/icons-react';
import { getUtmAttribution } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { UtmFilters } from '@/components/admin/marketing/UtmFilters';
import { MockNote } from '@/components/admin/ui';
import { fmtUsdCents, fmtInt, fmtPct } from '@/lib/admin/format';
import type { RawSearchParams } from '@/lib/admin/users-query';

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AttributionPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing.attribution');

  const rows = await getUtmAttribution({ from: one(searchParams.from), to: one(searchParams.to) });
  const totals = rows.reduce(
    (a, r) => ({ signups: a.signups + r.signups, converted: a.converted + r.converted, revenue: a.revenue + r.revenueCents }),
    { signups: 0, converted: 0, revenue: 0 },
  );

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <UtmFilters />
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink/12 bg-paper-light">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
              <th className="px-3 py-2">{t('col.source')}</th>
              <th className="px-3 py-2">{t('col.medium')}</th>
              <th className="px-3 py-2">{t('col.campaign')}</th>
              <th className="px-3 py-2 text-right">{t('col.signups')}</th>
              <th className="px-3 py-2 text-right">{t('col.converted')}</th>
              <th className="px-3 py-2 text-right">{t('col.rate')}</th>
              <th className="px-3 py-2 text-right">{t('col.revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center font-mono text-xs text-graphite/55">{t('empty')}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.source}|${r.medium}|${r.campaign}`} className="border-b border-ink/8 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-3 py-2.5 text-[13px] font-medium text-ink">{r.source}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] uppercase text-ink/55">{r.medium}</td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-ink/70">{r.campaign}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink/85">{fmtInt(r.signups)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-teal">{fmtInt(r.converted)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink/65">{fmtPct(r.conversionPct)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{fmtUsdCents(r.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-ink/15 font-mono text-[12px] tabular-nums">
                <td className="px-3 py-2 uppercase text-ink/55" colSpan={3}>{t('total')}</td>
                <td className="px-3 py-2 text-right text-ink">{fmtInt(totals.signups)}</td>
                <td className="px-3 py-2 text-right text-teal">{fmtInt(totals.converted)}</td>
                <td className="px-3 py-2 text-right text-ink/65">{fmtPct(totals.signups ? (totals.converted / totals.signups) * 100 : 0)}</td>
                <td className="px-3 py-2 text-right text-ink">{fmtUsdCents(totals.revenue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-graphite/55">
        <IconChartArrows size={14} className="mt-0.5 shrink-0 text-ink/40" /> {t('captureNote')}
      </p>
      <MockNote>{t('mockNote')}</MockNote>
    </div>
  );
}
