import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getTransactions, getMethodVolumes, getPurchaseAttempts, getWebhookLogs } from '@/lib/admin/data';
import { parseTxQuery } from '@/lib/admin/tx-query';
import { getFxRate } from '@/lib/fx';
import { hasCap } from '@/lib/admin/guard';
import { type RawSearchParams, paramsOf } from '@/lib/admin/users-query';
import { Forbidden } from '@/components/admin/Forbidden';
import { TxFilters } from '@/components/admin/tx/TxFilters';
import { TxTable } from '@/components/admin/tx/TxTable';
import { ReceiptButtons } from '@/components/admin/tx/TxActions';
import { ProviderFeesPanel } from '@/components/admin/tx/ProviderFeesPanel';
import { AttemptsPanel } from '@/components/admin/tx/AttemptsPanel';
import { RefundButton } from '@/components/admin/users/UserActions';
import { Pagination } from '@/components/admin/users/Pagination';
import { Link } from '@/i18n/routing';
import { IconCurrencyDollar, IconArrowRight, IconFileDownload } from '@tabler/icons-react';
import { fmtInt } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('transactions.read'))) return <Forbidden />;

  const t = await getTranslations('admin.tx');
  const canRefund = await hasCap('transactions.refund');

  const query = parseTxQuery(searchParams);
  const [data, volumes, rate, attempts, moncashFailureLogs] = await Promise.all([
    getTransactions(query),
    getMethodVolumes(),
    getFxRate(),
    getPurchaseAttempts(),
    getWebhookLogs({ provider: 'moncash', status: 'failed' }),
  ]);

  const qs = paramsOf(searchParams).toString();
  const exportHref = `/${locale}/admin/transactions/export${qs ? `?${qs}` : ''}`;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <a
          href={exportHref}
          className="flex items-center gap-1.5 rounded-lg border border-ink/12 bg-paper-light px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/70 hover:border-ochre/40 hover:text-ink"
        >
          <IconFileDownload size={14} /> {t('exportCsv')}
        </a>
      </div>

      <AttemptsPanel data={attempts} rate={rate} locale={locale} moncashFailures={moncashFailureLogs.length} />

      <TxFilters counts={data.counts} />
      <TxTable
        rows={data.rows}
        rate={rate}
        searchParams={searchParams}
        locale={locale}
        canRefund={canRefund}
        RefundButton={RefundButton}
        ReceiptButtons={ReceiptButtons}
      />
      <Pagination
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        searchParams={searchParams}
        base="/admin/transactions"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Link href="/admin/taux" className="flex items-center justify-between gap-2 rounded-xl border border-ink/12 bg-paper-light p-4 hover:border-ochre/40">
          <span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
              <IconCurrencyDollar size={13} /> {t('fx.title')}
            </span>
            <span className="mt-1 block font-mono text-sm text-ink tabular-nums">1 USD = {fmtInt(rate)} HTG</span>
            <span className="mt-0.5 block font-mono text-[10px] text-ink/45">{t('fxMovedNote')}</span>
          </span>
          <IconArrowRight size={18} className="shrink-0 text-ochre" />
        </Link>
        <ProviderFeesPanel volumes={volumes} />
      </div>
    </div>
  );
}
