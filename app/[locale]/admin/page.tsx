import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getKpiOverview } from '@/lib/admin/data';
import { fmtInt, fmtUsdCents, fmtHtgFromCents, fmtPct } from '@/lib/admin/format';
import { KpiGroup, KpiCard, KpiSplitCard, MockNote } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('admin.overview');
  const k = await getKpiOverview();

  const period = {
    today: t('period.today'),
    d7: t('period.d7'),
    d30: t('period.d30'),
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>
      <MockNote>{t('note.mock')}</MockNote>

      {/* Task 5 — volumes & revenue */}
      <KpiGroup title={t('groups.volumes')}>
        <KpiCard label={t('kpi.totalUsers')} value={fmtInt(k.totalUsers)} />
        <KpiCard
          label={t('kpi.activeSubscribers')}
          value={fmtInt(k.activeSubscribers)}
          tone="teal"
        />
        <KpiCard
          label={t('kpi.mrr')}
          value={fmtUsdCents(k.mrrCents)}
          secondary={fmtHtgFromCents(k.mrrCents)}
          hint={t('kpi.perMonth')}
          tone="ochre"
        />
        <KpiCard
          label={t('kpi.totalRevenue')}
          value={fmtUsdCents(k.totalRevenueCents)}
          secondary={fmtHtgFromCents(k.totalRevenueCents)}
        />
        <KpiCard
          label={t('kpi.revenueThisMonth')}
          value={fmtUsdCents(k.revenueThisMonthCents)}
          secondary={fmtHtgFromCents(k.revenueThisMonthCents)}
        />
      </KpiGroup>

      {/* Task 6 — growth */}
      <KpiGroup title={t('groups.growth')}>
        <KpiSplitCard
          label={t('kpi.newUsers')}
          rows={[
            { label: period.today, value: fmtInt(k.newUsersToday) },
            { label: period.d7, value: fmtInt(k.newUsers7d) },
            { label: period.d30, value: fmtInt(k.newUsers30d) },
          ]}
        />
        <KpiSplitCard
          label={t('kpi.newEnrollments')}
          rows={[
            { label: period.today, value: fmtInt(k.newEnrollmentsToday) },
            { label: period.d7, value: fmtInt(k.newEnrollments7d) },
            { label: period.d30, value: fmtInt(k.newEnrollments30d) },
          ]}
        />
      </KpiGroup>

      {/* Task 7 — conversion & engagement */}
      <KpiGroup title={t('groups.conversion')}>
        <KpiCard
          label={t('kpi.conversionVisitor')}
          value={fmtPct(k.conversionVisitorToAccountPct)}
          hint={t('note.visitors', { visitors: fmtInt(k.visitorsThisMonth) })}
        />
        <KpiCard
          label={t('kpi.conversionPaying')}
          value={fmtPct(k.conversionAccountToPayingPct)}
          tone="teal"
        />
        <KpiSplitCard
          label={t('kpi.activeLearners')}
          rows={[
            { label: period.d7, value: fmtInt(k.activeLearners7d) },
            { label: period.d30, value: fmtInt(k.activeLearners30d) },
          ]}
          tone="teal"
        />
      </KpiGroup>

      {/* Task 8 — retention & risk */}
      <KpiGroup title={t('groups.retention')}>
        <KpiCard label={t('kpi.churn')} value={fmtPct(k.churnRatePct)} tone="alert" />
        <KpiCard
          label={t('kpi.arpu')}
          value={fmtUsdCents(k.arpuCents)}
          secondary={fmtHtgFromCents(k.arpuCents)}
        />
        <KpiCard
          label={t('kpi.ltv')}
          value={fmtUsdCents(k.ltvCents)}
          secondary={fmtHtgFromCents(k.ltvCents)}
        />
        <KpiCard
          label={t('kpi.refunds')}
          value={fmtInt(k.refundsCount)}
          secondary={fmtUsdCents(k.refundsAmountCents)}
          tone={k.refundsCount > 0 ? 'alert' : 'default'}
        />
      </KpiGroup>
    </div>
  );
}
