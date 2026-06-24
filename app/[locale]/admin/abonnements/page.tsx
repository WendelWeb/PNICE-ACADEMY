import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  getSubKpis,
  getSubscriptions,
  getSubEvents,
  getDunning,
  getRenewals,
  getRenewalSeries,
  getCohorts,
  getCancellationReasons,
} from '@/lib/admin/data';
import { parseSubQuery } from '@/lib/admin/sub-query';
import { hasCap } from '@/lib/admin/guard';
import { type RawSearchParams } from '@/lib/admin/users-query';
import { Forbidden } from '@/components/admin/Forbidden';
import { Pagination } from '@/components/admin/users/Pagination';
import { SubKpis } from '@/components/admin/subs/SubKpis';
import { SubFilters } from '@/components/admin/subs/SubFilters';
import { SubTable } from '@/components/admin/subs/SubTable';
import { EventsFeed } from '@/components/admin/subs/EventsFeed';
import { DunningPanel } from '@/components/admin/subs/DunningPanel';
import { CancellationReasons } from '@/components/admin/subs/CancellationReasons';
import { Renewals7Panel, Renewals30Panel } from '@/components/admin/subs/RenewalsPanels';
import { CohortTable } from '@/components/admin/subs/CohortTable';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('transactions.read'))) return <Forbidden />;

  const t = await getTranslations('admin.subs');
  const query = parseSubQuery(searchParams);

  const [kpis, page, events, dunning, renewals7, renewalSeries, cohorts, reasons] = await Promise.all([
    getSubKpis(),
    getSubscriptions(query),
    getSubEvents(),
    getDunning(),
    getRenewals(7),
    getRenewalSeries(30),
    getCohorts(),
    getCancellationReasons(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <SubKpis data={kpis} />
      <SubFilters counts={{ past_due: page.counts.past_due, renew7: page.counts.renew7 }} />
      <SubTable rows={page.rows} searchParams={searchParams} locale={locale} />
      <Pagination
        total={page.total}
        page={page.page}
        pageSize={page.pageSize}
        searchParams={searchParams}
        base="/admin/abonnements"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <EventsFeed events={events} locale={locale} />
        <DunningPanel rows={dunning} locale={locale} />
        <CancellationReasons reasons={reasons} />
        <Renewals7Panel rows={renewals7} locale={locale} />
      </div>

      <Renewals30Panel series={renewalSeries} />
      <CohortTable rows={cohorts} locale={locale} />
    </div>
  );
}
