import { getTranslations } from 'next-intl/server';
import { IconArrowUpRight, IconArrowDownRight } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtHtgFromCents, fmtPct, fmtInt } from '@/lib/admin/format';
import type { SubKpis as SubKpisData } from '@/lib/admin/data';

export async function SubKpis({ data }: { data: SubKpisData }) {
  const t = await getTranslations('admin.subs.kpi');
  const up = data.mrrChangeCents >= 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Card label={t('mrr')} tone="ochre">
        <span className="font-mono text-[22px] font-semibold leading-none text-ochre tabular-nums">
          {fmtUsdCents(data.mrrCurrentCents)}
        </span>
        <span className="mt-1 block font-mono text-[10px] text-ink/45 tabular-nums">
          {fmtHtgFromCents(data.mrrCurrentCents)}
        </span>
        <span
          className={cn(
            'mt-1.5 flex items-center gap-0.5 font-mono text-[11px] tabular-nums',
            up ? 'text-teal' : 'text-stampred',
          )}
        >
          {up ? <IconArrowUpRight size={12} /> : <IconArrowDownRight size={12} />}
          {fmtPct(Math.abs(data.mrrChangePct))} · {up ? '+' : ''}
          {fmtUsdCents(data.mrrChangeCents)}
        </span>
      </Card>

      <Card label={t('prevMonth')}>
        <Value>{fmtUsdCents(data.mrrPrevMonthCents)}</Value>
      </Card>
      <Card label={t('projected')} hint={t('projectedHint')}>
        <Value tone="teal">{fmtUsdCents(data.mrrProjectedCents)}</Value>
      </Card>
      <Card label={t('churn')} hint={t('churnHint')}>
        <Value tone={data.mrrChurnThisMonthCents > 0 ? 'stampred' : 'default'}>
          {fmtUsdCents(data.mrrChurnThisMonthCents)}
        </Value>
      </Card>
      <Card label={t('atRisk')} hint={t('atRiskHint')}>
        <Value tone={data.mrrAtRisk30dCents > 0 ? 'ochre' : 'default'}>
          {fmtUsdCents(data.mrrAtRisk30dCents)}
        </Value>
        <span className="mt-1 block font-mono text-[10px] text-ink/45">
          {fmtInt(data.activeCount)} {t('active')}
        </span>
      </Card>
    </div>
  );
}

function Card({
  label,
  hint,
  tone,
  children,
}: {
  label: string;
  hint?: string;
  tone?: 'ochre';
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border bg-paper-light p-3.5', tone === 'ochre' ? 'border-ochre/30' : 'border-ink/12')}>
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink/55">{label}</p>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[10px] leading-snug text-graphite/55">{hint}</p>}
    </div>
  );
}

function Value({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'teal' | 'stampred' | 'ochre';
  children: React.ReactNode;
}) {
  const cls = { default: 'text-ink', teal: 'text-teal', stampred: 'text-stampred', ochre: 'text-ochre' }[tone];
  return (
    <span className={cn('font-mono text-lg font-semibold leading-none tabular-nums', cls)}>{children}</span>
  );
}
