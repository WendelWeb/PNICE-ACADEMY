import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { listWithdrawalRequests, countWithdrawalsByStatus } from '@/lib/teacher/payouts';
import type { WithdrawalRow } from '@/lib/teacher/profile';
import { fmtDate, fmtUsdCents } from '@/lib/admin/format';
import { paramsOf, mergeParams, type RawSearchParams } from '@/lib/admin/users-query';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { PayoutActions } from '@/components/admin/payouts/PayoutActions';

export const dynamic = 'force-dynamic';

const BASE = '/admin/retraits';
const TABS: WithdrawalRow['status'][] = ['pending', 'paid', 'rejected'];

export default async function PayoutsPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('payouts.process'))) return <Forbidden />;

  const t = await getTranslations('admin.payouts');
  const params = paramsOf(searchParams);
  const activeTab = (TABS.includes(params.get('status') as WithdrawalRow['status'])
    ? (params.get('status') as WithdrawalRow['status'])
    : 'pending');

  const [rows, counts] = await Promise.all([listWithdrawalRequests(activeTab), countWithdrawalsByStatus()]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <div className="flex flex-wrap gap-2 border-b border-ink/10 pb-2">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={`${BASE}${mergeParams(params, { status: tab })}`}
            className={cn(
              'rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
              activeTab === tab ? 'bg-ink text-paper-light' : 'text-ink/55 hover:bg-ink/[0.05]',
            )}
          >
            {t(`tabs.${tab}`)} ({counts[tab]})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                <th className="px-3 py-2">{t('col.teacher')}</th>
                <th className="px-3 py-2">{t('col.amount')}</th>
                <th className="px-3 py-2">{t('col.method')}</th>
                <th className="px-3 py-2">{t('col.destination')}</th>
                <th className="px-3 py-2">{t('col.balance')}</th>
                <th className="px-3 py-2">{t('col.requestedAt')}</th>
                <th className="px-3 py-2 text-right">{t('col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/8 last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="block text-[13px] font-medium text-ink">{r.teacherName || r.teacherEmail}</span>
                    <span className="block font-mono text-[10px] text-ink/45">{r.teacherEmail}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-ink">
                    {fmtUsdCents(r.amountCents)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-ink/70">
                    {r.method ? r.method.toUpperCase() : t('noMethod')}
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5 font-mono text-[11px] text-graphite/70">
                    {r.destinationSnapshot || t('noMethod')}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-ink/70">{fmtUsdCents(r.balanceCents)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink/60">
                    {fmtDate(r.createdAt, locale)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <PayoutActions id={r.id} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
