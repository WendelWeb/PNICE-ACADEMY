import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconChartPie, IconClock } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import {
  getPlatformPassPeriodView,
  listPlatformPassPeriods,
  type PlatformPassPeriodView,
} from '@/lib/teacher/platform-pass-payout';
import { monthPeriodOf, previousMonthPeriod } from '@/lib/teacher/platform-pass-split';
import { getFxRate } from '@/lib/fx';
import { fmtUsdCents, fmtHtgFromCents, fmtPeriodLabel, fmtDateTime, fmtInt } from '@/lib/admin/format';
import { PlatformPassSplitPanel } from '@/components/admin/payouts/PlatformPassSplitPanel';

export const dynamic = 'force-dynamic';

/**
 * /admin/repartition — the "Pass PNICE" pro-rata payout split (Task:
 * pro-rata split of PNICE all-access revenue). Business admin space (NOT the
 * course space), gated on `payouts.process` — the SAME capability
 * /admin/retraits uses: this page moves money into the same teacher ledger
 * that page's payout queue reads. Shows the owner the split BEFORE trusting
 * it: the not-yet-computed candidate period renders a live, read-only
 * preview (lib/teacher/platform-pass-payout.ts's `computed: false`) with a
 * "lancer la répartition" button; every already-run period below is the
 * PERSISTED, immutable record.
 */
export default async function PlatformPassSplitPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('payouts.process'))) return <Forbidden />;

  const t = await getTranslations('admin.repartition');
  const targetPeriod = previousMonthPeriod(monthPeriodOf(new Date()));

  const [candidate, history, fxRate] = await Promise.all([
    getPlatformPassPeriodView(targetPeriod),
    listPlatformPassPeriods(),
    getFxRate(),
  ]);
  const alreadyListed = history.some((h) => h.period === targetPeriod);

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <div>
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <p className="mt-2 rounded-lg bg-teal/[0.06] px-3 py-2 text-[13px] leading-relaxed text-ink/80">{t('explain')}</p>
      </div>

      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconChartPie size={13} /> {t('candidate.title', { period: fmtPeriodLabel(targetPeriod, locale) })}
        </h2>
        {!candidate.computed && (
          <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-ink/45">
            <IconClock size={11} /> {t('candidate.previewNote')}
          </p>
        )}

        <PeriodStats view={candidate} fxRate={fxRate} t={t} />
        <SharesTable view={candidate} fxRate={fxRate} t={t} />

        {!candidate.computed && !alreadyListed && (
          <div className="mt-4 border-t border-ink/10 pt-3">
            <PlatformPassSplitPanel period={targetPeriod} />
          </div>
        )}
        {alreadyListed && <p className="mt-2 font-mono text-[10px] text-ink/45">{t('candidate.alreadyListed')}</p>}
      </section>

      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('history.title')}</h2>
        {history.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-10 text-center font-mono text-sm text-graphite/60">
            {t('empty')}
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            {history.map((view) => (
              <div key={view.period} className="rounded-xl border border-ink/12 bg-paper-light p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-ink">{fmtPeriodLabel(view.period, locale)}</h3>
                  {view.computedBy && (
                    <p className="font-mono text-[10px] text-ink/45">
                      {t('computedBy', { name: view.computedBy })} · {fmtDateTime(view.computedAt, locale)}
                    </p>
                  )}
                </div>
                <PeriodStats view={view} fxRate={fxRate} t={t} />
                <SharesTable view={view} fxRate={fxRate} t={t} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;

function Stat({ label, cents, fxRate }: { label: string; cents: number; fxRate: number }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{label}</p>
      <p className="font-mono text-sm font-semibold text-ink">{fmtUsdCents(cents)}</p>
      <p className="font-mono text-[10px] text-ink/40">{fmtHtgFromCents(cents, fxRate)}</p>
    </div>
  );
}

function PeriodStats({ view, fxRate, t }: { view: PlatformPassPeriodView; fxRate: number; t: T }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label={t('card.gross')} cents={view.grossCents} fxRate={fxRate} />
      <Stat label={t('card.ownPool')} cents={view.ownPoolCents} fxRate={fxRate} />
      <Stat label={t('card.carryIn')} cents={view.carryInCents} fxRate={fxRate} />
      <Stat label={t('card.totalPool')} cents={view.totalPoolCents} fxRate={fxRate} />
      <Stat label={t('card.distributed')} cents={view.distributedCents} fxRate={fxRate} />
      <Stat label={t('card.carryOut')} cents={view.carryOutCents} fxRate={fxRate} />
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('card.consumption')}</p>
        <p className="font-mono text-sm font-semibold text-ink">{fmtInt(view.consumptionTotal)}</p>
      </div>
    </div>
  );
}

function SharesTable({ view, fxRate, t }: { view: PlatformPassPeriodView; fxRate: number; t: T }) {
  if (view.shares.length === 0) {
    return <p className="mt-3 font-mono text-[11px] text-graphite/55">{t('noShares')}</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-ink/10">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead className="bg-paper">
          <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
            <th className="px-3 py-1.5">{t('col.teacher')}</th>
            <th className="px-3 py-1.5">{t('col.completions')}</th>
            <th className="px-3 py-1.5">{t('col.share')}</th>
          </tr>
        </thead>
        <tbody>
          {view.shares.map((s) => (
            <tr key={s.teacherUserId} className="border-b border-ink/5 last:border-0">
              <td className="px-3 py-2">
                <span className="block text-[13px] font-medium text-ink">{s.teacherName || s.teacherEmail}</span>
                <span className="block font-mono text-[10px] text-ink/45">{s.teacherEmail}</span>
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-ink/70">{fmtInt(s.completions)}</td>
              <td className="px-3 py-2 font-mono text-[13px] font-semibold text-ink">
                {fmtUsdCents(s.shareCents)}
                <span className="ml-1 font-normal text-ink/40">({fmtHtgFromCents(s.shareCents, fxRate)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
