import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getAnalytics } from '@/lib/admin/data';
import { parsePeriod } from '@/lib/admin/period';
import { hasCap } from '@/lib/admin/guard';
import { type RawSearchParams } from '@/lib/admin/users-query';
import { Forbidden } from '@/components/admin/Forbidden';
import { PeriodSelector } from '@/components/admin/analytics/PeriodSelector';
import { LazyCharts } from '@/components/admin/analytics/LazyCharts';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('transactions.read'))) return <Forbidden />;

  const t = await getTranslations('admin.analytics');
  const period = parsePeriod(searchParams);
  const data = await getAnalytics({
    from: period.from,
    to: period.to,
    granularity: period.granularity,
  });

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <PeriodSelector />
      </div>
      <LazyCharts data={data} locale={locale} />
    </div>
  );
}
