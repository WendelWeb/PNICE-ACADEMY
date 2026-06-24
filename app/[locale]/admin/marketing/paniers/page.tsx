import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconShoppingCartX, IconClockPlay } from '@tabler/icons-react';
import { getAbandonedCarts, getCartStats, getOpenCarts } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { MarkAbandonedButton, RemindCartButton } from '@/components/admin/marketing/CartActions';
import { CartStatusBadge } from '@/components/admin/marketing/ui';
import { KpiCard, MockNote } from '@/components/admin/ui';
import { Link } from '@/i18n/routing';
import { fmtUsdCents, fmtInt, fmtPct, fmtDateTime } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

export default async function PaniersPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing.carts');

  const [carts, stats, open] = await Promise.all([getAbandonedCarts(), getCartStats(), getOpenCarts()]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('kpi.abandoned')} value={fmtInt(stats.abandoned)} tone="ochre" />
        <KpiCard label={t('kpi.reminded')} value={fmtInt(stats.reminded)} />
        <KpiCard label={t('kpi.converted')} value={fmtInt(stats.convertedAfterReminder)} tone="teal" />
        <KpiCard label={t('kpi.rate')} value={fmtPct(stats.reminderConversionPct)} tone="teal" secondary={t('kpi.rateNote')} />
      </div>

      {/* Open sessions — sim of the 2h cron */}
      <section className="rounded-xl border border-dashed border-ochre/40 bg-ochre/[0.04] p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ochre">
          <IconClockPlay size={13} /> {t('open.title')} ({open.length})
        </h2>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-graphite/60">{t('open.note')}</p>
        {open.length === 0 ? (
          <p className="mt-2 font-mono text-xs text-graphite/55">{t('open.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {open.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-light px-3 py-2">
                <span className="min-w-0">
                  <span className="text-[13px] text-ink">{s.userName || t('guest')}</span>
                  <span className="block font-mono text-[10px] text-ink/50">
                    {locale === 'ht' ? s.productTitle_ht : s.productTitle_fr} · {fmtUsdCents(s.amountCents)} · {fmtDateTime(s.startedAt, locale)}
                  </span>
                </span>
                <MarkAbandonedButton id={s.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Abandoned carts */}
      <div className="overflow-x-auto rounded-xl border border-ink/12 bg-paper-light">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
              <th className="px-3 py-2">{t('col.user')}</th>
              <th className="px-3 py-2">{t('col.product')}</th>
              <th className="px-3 py-2 text-right">{t('col.amount')}</th>
              <th className="px-3 py-2">{t('col.abandonedAt')}</th>
              <th className="px-3 py-2">{t('col.status')}</th>
              <th className="px-3 py-2 text-right">{t('col.action')}</th>
            </tr>
          </thead>
          <tbody>
            {carts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center font-mono text-xs text-graphite/55">{t('empty')}</td>
              </tr>
            )}
            {carts.map((c) => (
              <tr key={c.id} className="border-b border-ink/8 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-3 py-2.5">
                  {c.isGuest ? (
                    <span className="flex items-center gap-1.5 text-[13px] text-ink/55">
                      <IconShoppingCartX size={14} className="text-ink/35" /> {t('guest')}
                    </span>
                  ) : (
                    <Link href={`/admin/utilisateurs/${c.userId}`} className="text-[13px] text-ink hover:text-ochre">
                      {c.userName}
                      <span className="block font-mono text-[10px] text-ink/45">{c.userEmail}</span>
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-ink/75">
                  {locale === 'ht' ? c.productTitle_ht : c.productTitle_fr}
                  {c.productCode && <span className="ml-1 font-mono text-[10px] text-ink/40">{c.productCode}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{fmtUsdCents(c.amountCents)}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-ink/65 tabular-nums">{fmtDateTime(c.abandonedAt, locale)}</td>
                <td className="px-3 py-2.5"><CartStatusBadge status={c.reminderStatus} label={t(`reminderStatus.${c.reminderStatus}`)} /></td>
                <td className="px-3 py-2.5 text-right">
                  {c.isGuest ? (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-ink/35">{t('noEmail')}</span>
                  ) : c.reminderStatus === 'converted' ? (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-teal">{t('reminderStatus.converted')}</span>
                  ) : (
                    <RemindCartButton id={c.id} reminded={c.reminderStatus === 'reminded'} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MockNote>{t('mockNote')}</MockNote>
    </div>
  );
}
