import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconScale } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { getReconciliation } from '@/lib/teacher/reconciliation';
import { getFxRate } from '@/lib/fx';
import { KpiGroup, KpiCard } from '@/components/admin/ui';
import { fmtUsdCents, fmtHtgFromCents } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

/**
 * /admin/bilan — Stage 3 finance surface, item 4 (reconciliation): the one
 * screen answering "what did the platform earn, what do I owe teachers, what
 * have I already paid out, what is outstanding" — derived from
 * earnings_ledger + withdrawal_requests + platform_pass_periods (see
 * lib/teacher/reconciliation.ts for the exact math). Business admin space,
 * gated on the SAME `payouts.process` capability /admin/retraits and
 * /admin/repartition already use — this page reads the same teacher ledger
 * those pages act on, just as a read-only balance sheet instead of a queue.
 */
export default async function ReconciliationPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('payouts.process'))) return <Forbidden />;

  const t = await getTranslations('admin.reconciliation');
  const [data, fxRate] = await Promise.all([getReconciliation(), getFxRate()]);
  const { totals, byTeacher } = data;

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <KpiGroup title={t('group.platform')}>
        <KpiCard
          label={t('kpi.platformCommission')}
          value={fmtUsdCents(totals.platformCommissionCents)}
          secondary={fmtHtgFromCents(totals.platformCommissionCents, fxRate)}
          tone="teal"
          hint={t('kpi.platformCommissionHint')}
        />
        <KpiCard
          label={t('kpi.outstanding')}
          value={fmtUsdCents(totals.outstandingCents)}
          secondary={fmtHtgFromCents(totals.outstandingCents, fxRate)}
          tone="ochre"
          hint={t('kpi.outstandingHint')}
        />
        <KpiCard
          label={t('kpi.pendingWithdrawals')}
          value={fmtUsdCents(totals.pendingWithdrawalsCents)}
          secondary={fmtHtgFromCents(totals.pendingWithdrawalsCents, fxRate)}
          hint={t('kpi.pendingWithdrawalsHint')}
        />
        <KpiCard
          label={t('kpi.paidOut')}
          value={fmtUsdCents(totals.paidOutCents)}
          secondary={fmtHtgFromCents(totals.paidOutCents, fxRate)}
          hint={t('kpi.paidOutHint')}
        />
      </KpiGroup>

      <section className="space-y-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('group.byTeacher')}</h2>
        <p className="font-mono text-[11px] leading-relaxed text-graphite/55">{t('byTeacherHelp')}</p>

        {byTeacher.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
            {t('empty')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/12">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead className="bg-paper-light">
                <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                  <th className="px-3 py-2">{t('col.teacher')}</th>
                  <th className="px-3 py-2 text-right">{t('col.grossSales')}</th>
                  <th className="px-3 py-2 text-right">{t('col.commission')}</th>
                  <th className="px-3 py-2 text-right">{t('col.platformPass')}</th>
                  <th className="px-3 py-2 text-right">{t('col.netEarned')}</th>
                  <th className="px-3 py-2 text-right">{t('col.paidOut')}</th>
                  <th className="px-3 py-2 text-right">{t('col.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {byTeacher.map((r) => (
                  <tr key={r.teacherUserId} className="border-b border-ink/8 last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="block text-[13px] font-medium text-ink">{r.teacherName || r.teacherEmail}</span>
                      <span className="block font-mono text-[10px] text-ink/45">{r.teacherEmail}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink/70 tabular-nums">
                      {fmtUsdCents(r.grossSalesCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink/70 tabular-nums">
                      {fmtUsdCents(r.commissionCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink/70 tabular-nums">
                      {fmtUsdCents(r.platformPassCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] font-medium text-ink tabular-nums">
                      {fmtUsdCents(r.netEarnedCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink/70 tabular-nums">
                      {fmtUsdCents(r.paidOutCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] font-semibold text-ochre tabular-nums">
                      {fmtUsdCents(r.balanceCents)}
                      {r.pendingWithdrawalCents > 0 && (
                        <span className="ml-1.5 block font-mono text-[9px] font-normal uppercase text-ink/40">
                          {t('col.pendingBadge', { amount: fmtUsdCents(r.pendingWithdrawalCents) })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-graphite/55">
        <IconScale size={13} className="mt-0.5 shrink-0 text-ink/35" />
        {t('note')}
      </p>
    </div>
  );
}
