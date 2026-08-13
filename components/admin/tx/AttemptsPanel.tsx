import { getTranslations } from 'next-intl/server';
import { IconDeviceMobile, IconCreditCard, IconAlertTriangle } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { KpiGroup, KpiCard } from '@/components/admin/ui';
import { fmtUsdCents, fmtPct, fmtInt, fmtDateTime } from '@/lib/admin/format';
import { htgFromCentsAt } from '@/lib/admin/settings';
import type { PurchaseAttempts, AttemptRail } from '@/lib/admin/data';

const railIcon: Record<AttemptRail, typeof IconCreditCard> = {
  card: IconCreditCard,
  moncash: IconDeviceMobile,
};

/**
 * Stage 3 finance surface, item 1 — the conversion signal /admin/transactions
 * never showed: how many checkouts were started, how many completed, and
 * (item 2's "money that failed" piece) the most recent attempts that never
 * paid, with enough detail to tell "buyer walked away" apart from "the
 * provider never even created an order" (a genuine MonCash/Stripe failure).
 * `moncashFailures` (webhook_logs, provider='moncash', status='failed') is a
 * DIFFERENT signal from the same rail — surfaced here with a link to
 * /admin/sante rather than duplicated, so a real outage is visible where the
 * owner reviews money instead of only on the separate Système page.
 */
export async function AttemptsPanel({
  data,
  rate,
  locale,
  moncashFailures,
}: {
  data: PurchaseAttempts;
  rate: number;
  locale: 'ht' | 'fr';
  moncashFailures: number;
}) {
  const t = await getTranslations('admin.tx.attempts');
  const { stats, recent } = data;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')}</h2>
        <Link href="/admin/marketing/paniers" className="font-mono text-[10px] uppercase tracking-wide text-ochre hover:underline">
          {t('viewCarts')}
        </Link>
      </div>

      <KpiGroup title={t('statGroup')}>
        <KpiCard label={t('stat.total')} value={fmtInt(stats.totalAttempts)} hint={t('stat.totalHint')} />
        <KpiCard label={t('stat.completed')} value={fmtInt(stats.completed)} tone="teal" />
        <KpiCard label={t('stat.conversion')} value={fmtPct(stats.conversionPct)} tone="ochre" />
        <KpiCard
          label={t('stat.byRail')}
          value={stats.byRail.map((r) => `${t(`rail.${r.rail}`)} ${fmtInt(r.attempts)}`).join(' · ') || '—'}
        />
      </KpiGroup>

      {moncashFailures > 0 && (
        <Link
          href="/admin/sante"
          className="flex items-center gap-2 rounded-lg bg-stampred/10 px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-stampred hover:bg-stampred/15"
        >
          <IconAlertTriangle size={14} className="shrink-0" />
          {t('moncashFailures', { count: moncashFailures })}
        </Link>
      )}

      {recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-8 text-center font-mono text-xs text-graphite/55">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                <th className="px-3 py-2">{t('col.user')}</th>
                <th className="px-3 py-2">{t('col.product')}</th>
                <th className="px-3 py-2">{t('col.rail')}</th>
                <th className="px-3 py-2 text-right">{t('col.amount')}</th>
                <th className="px-3 py-2">{t('col.providerOrder')}</th>
                <th className="px-3 py-2">{t('col.state')}</th>
                <th className="px-3 py-2 text-right">{t('col.startedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => {
                const RailIcon = railIcon[r.rail];
                return (
                  <tr key={r.id} className={cn('border-b border-ink/8 last:border-0', !r.providerOrderCreated && 'bg-stampred/[0.03]')}>
                    <td className="px-3 py-2.5">
                      {r.isGuest ? (
                        <span className="text-[13px] text-ink/55">{t('guest')}</span>
                      ) : r.userId ? (
                        <Link href={`/admin/utilisateurs/${r.userId}`} className="text-[13px] text-ink hover:text-ochre">
                          {r.userName}
                          <span className="block font-mono text-[10px] text-ink/45">{r.userEmail}</span>
                        </Link>
                      ) : (
                        <span className="text-[13px] text-ink/70">{r.userName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-ink/75">
                      {locale === 'ht' ? r.productTitle_ht : r.productTitle_fr}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-[13px] text-ink/75">
                        <RailIcon size={15} className="text-ink/55" />
                        {t(`rail.${r.rail}`)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <span className="block font-mono text-sm text-ink tabular-nums">{fmtUsdCents(r.amountCents)}</span>
                      <span className="block font-mono text-[10px] text-ink/45 tabular-nums">
                        {fmtInt(htgFromCentsAt(r.amountCents, rate))} HTG
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('font-mono text-[11px] uppercase', r.providerOrderCreated ? 'text-ink/55' : 'text-stampred')}>
                        {r.providerOrderCreated ? t('providerOrder.yes') : t('providerOrder.no')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('font-mono text-[11px] uppercase', r.state === 'abandoned' ? 'text-ink/45' : 'text-ochre')}>
                        {t(`state.${r.state}`)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] text-ink/65 tabular-nums">
                      {fmtDateTime(r.startedAt, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
