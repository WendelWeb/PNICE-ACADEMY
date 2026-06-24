'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { fmtInt, fmtUsdCents, fmtPct } from '@/lib/admin/format';
import type { AnalyticsData, PaymentMethod, FunnelStepKey } from '@/lib/admin/data';

const C = {
  teal: '#1F6E66',
  ochre: '#D98E2B',
  ink: '#10204A',
  red: '#B23A2E',
  lightTeal: '#4E9A92',
  lightOchre: '#E6BD7E',
  grid: 'rgba(16,32,74,0.08)',
  axis: '#2B2B28',
};
const METHOD_COLORS: Record<PaymentMethod, string> = {
  paypal: C.teal,
  card: C.ink,
  moncash: C.ochre,
  natcash: C.lightTeal,
  crypto: C.lightOchre,
};

const usd = (cents: number) => '$' + Math.round(cents / 100).toLocaleString('en-US');
const tickFont = { fontSize: 10, fill: C.axis, fontFamily: 'IBM Plex Mono, monospace' };
const tooltipStyle = {
  contentStyle: {
    background: '#F2EEE4',
    border: '1px solid rgba(16,32,74,0.15)',
    borderRadius: 8,
    fontSize: 12,
    fontFamily: 'IBM Plex Mono, monospace',
  },
};

function ChartCard({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-ink/12 bg-paper-light p-4', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{title}</h2>
        {hint && <span className="font-mono text-xs text-ink/45 tabular-nums">{hint}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AnalyticsCharts({
  data,
  locale,
}: {
  data: AnalyticsData;
  locale: 'ht' | 'fr';
}) {
  const t = useTranslations('admin.analytics');
  const title = (slug: { title_fr: string; title_ht: string }) =>
    locale === 'ht' ? slug.title_ht : slug.title_fr;

  /* prep chart-ready data (cents → dollars) */
  const revenue = data.revenueSeries.map((b) => ({
    bucket: b.bucket,
    sub: b.subscriptionCents / 100,
    course: b.courseCents / 100,
  }));
  const enrollments = data.enrollmentsSeries.map((b) => ({
    bucket: b.bucket,
    enr: b.enrollments,
    sub: b.subscriptions,
  }));
  const subGrowth = data.subscriptionGrowth.map((b) => ({
    bucket: b.bucket,
    active: b.activeCumulative,
    created: b.created,
    canceled: b.canceled,
  }));
  const byCourse = data.revenueByCourse.map((c) => ({
    name: c.code,
    revenue: c.revenueCents / 100,
    enrollments: c.enrollments,
    label: title(c),
  }));
  const geoPie = [
    { name: t('geo.ht'), value: data.geo.htUsers, fill: C.ochre },
    { name: t('geo.diaspora'), value: data.geo.diasporaUsers, fill: C.ink },
  ];

  const dayLabels = t.raw('heatmap.days') as string[];
  const maxHeat = Math.max(1, ...data.heatmap.map((c) => c.count));

  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count));
  const stepLabel = (s: FunnelStepKey) => t(`funnel.steps.${s}`);

  const langTotalUsers = data.language.ht.users + data.language.fr.users || 1;
  const langTotalRev = data.language.ht.revenueCents + data.language.fr.revenueCents || 1;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 1. Revenue over time */}
      <ChartCard
        title={t('charts.revenue')}
        hint={usd(data.revenueTotalCents)}
        className="lg:col-span-2"
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenue} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="bucket" tick={tickFont} tickLine={false} axisLine={{ stroke: C.grid }} />
              <YAxis tick={tickFont} tickLine={false} axisLine={false} tickFormatter={(v) => '$' + v} width={48} />
              <Tooltip {...tooltipStyle} formatter={(v) => '$' + Number(v).toLocaleString('en-US')} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} />
              <Bar dataKey="sub" stackId="r" name={t('charts.subscription')} fill={C.teal} radius={[0, 0, 0, 0]} />
              <Bar dataKey="course" stackId="r" name={t('charts.course')} fill={C.ochre} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 2. Signups */}
      <ChartCard title={t('charts.signups')}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.signupsSeries} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="bucket" tick={tickFont} tickLine={false} axisLine={{ stroke: C.grid }} />
              <YAxis tick={tickFont} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name={t('charts.signups')} fill={C.ink} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 3. Enrollments + subscriptions */}
      <ChartCard title={t('charts.enrollments')}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrollments} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="bucket" tick={tickFont} tickLine={false} axisLine={{ stroke: C.grid }} />
              <YAxis tick={tickFont} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} />
              <Bar dataKey="enr" name={t('charts.enrollmentsLabel')} fill={C.ochre} radius={[3, 3, 0, 0]} />
              <Bar dataKey="sub" name={t('charts.subscriptionsLabel')} fill={C.teal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 4. Revenue by method (pie) */}
      <ChartCard title={t('charts.byMethod')}>
        <div className="flex items-center gap-4">
          <div className="h-48 w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.revenueByMethod} dataKey="cents" nameKey="method" innerRadius={36} outerRadius={64} paddingAngle={2}>
                  {data.revenueByMethod.map((m) => (
                    <Cell key={m.method} fill={METHOD_COLORS[m.method]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v) => usd(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-1/2 space-y-1.5">
            {data.revenueByMethod.map((m) => (
              <li key={m.method} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-ink/80">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: METHOD_COLORS[m.method] }} />
                  {t(`method.${m.method}`)}
                </span>
                <span className="font-mono text-ink tabular-nums">
                  {usd(m.cents)} · {fmtPct(m.pct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </ChartCard>

      {/* 5. Revenue by course (horizontal) */}
      <ChartCard title={t('charts.byCourse')} className="lg:col-span-2">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCourse} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis type="number" tick={tickFont} tickLine={false} axisLine={false} tickFormatter={(v) => '$' + v} />
              <YAxis type="category" dataKey="name" tick={tickFont} tickLine={false} axisLine={{ stroke: C.grid }} width={56} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v) => '$' + Number(v).toLocaleString('en-US')}
                labelFormatter={(_, p) => (p && p[0] ? (p[0].payload as { label: string }).label : '')}
              />
              <Bar dataKey="revenue" name={t('charts.revenue')} fill={C.ochre} radius={[0, 3, 3, 0]}>
                <LabelList
                  dataKey="enrollments"
                  position="right"
                  formatter={(v) => `${v} ${t('charts.enrollmentsShort')}`}
                  style={{ fontSize: 10, fill: C.axis, fontFamily: 'IBM Plex Mono, monospace' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 6. Subscription growth (line) */}
      <ChartCard title={t('charts.subGrowth')} className="lg:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={subGrowth} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="bucket" tick={tickFont} tickLine={false} axisLine={{ stroke: C.grid }} />
              <YAxis tick={tickFont} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} />
              <Line type="monotone" dataKey="active" name={t('charts.active')} stroke={C.teal} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="created" name={t('charts.created')} stroke={C.ochre} strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="canceled" name={t('charts.canceled')} stroke={C.red} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 7. Geo */}
      <ChartCard title={t('charts.geo')}>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={geoPie} dataKey="value" nameKey="name" outerRadius={64} label>
                {geoPie.map((g, i) => (
                  <Cell key={i} fill={g.fill} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase text-ink/45">
              <th className="py-1">{t('geo.country')}</th>
              <th className="py-1 text-right">{t('geo.users')}</th>
              <th className="py-1 text-right">{t('geo.revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {data.geo.topCountries.map((c) => (
              <tr key={c.country} className="border-b border-ink/8 last:border-0">
                <td className="py-1 text-ink/80">{c.country}</td>
                <td className="py-1 text-right font-mono text-ink tabular-nums">{fmtInt(c.users)}</td>
                <td className="py-1 text-right font-mono text-ink/70 tabular-nums">{usd(c.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      {/* 8. Language split (CSS bars) */}
      <ChartCard title={t('charts.language')}>
        <div className="space-y-4">
          <SplitBar
            label={t('charts.langUsers')}
            ht={data.language.ht.users}
            fr={data.language.fr.users}
            htPct={(data.language.ht.users / langTotalUsers) * 100}
            format={fmtInt}
          />
          <SplitBar
            label={t('charts.langRevenue')}
            ht={data.language.ht.revenueCents}
            fr={data.language.fr.revenueCents}
            htPct={(data.language.ht.revenueCents / langTotalRev) * 100}
            format={usd}
          />
        </div>
      </ChartCard>

      {/* 9. Conversion funnel (CSS) */}
      <ChartCard title={t('charts.funnel')} hint={t('funnel.mockVisitors')} className="lg:col-span-2">
        <ol className="space-y-1.5">
          {data.funnel.map((step, i) => {
            const prev = i > 0 ? data.funnel[i - 1].count : null;
            const conv = prev && prev > 0 ? (step.count / prev) * 100 : null;
            return (
              <li key={step.step} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-[13px] text-ink/80">{stepLabel(step.step)}</span>
                <span className="relative h-6 flex-1 overflow-hidden rounded bg-ink/[0.06]">
                  <span
                    className="absolute inset-y-0 left-0 rounded bg-teal/70"
                    style={{ width: `${(step.count / funnelMax) * 100}%` }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[11px] font-medium text-ink tabular-nums">
                    {fmtInt(step.count)}
                  </span>
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[11px] text-ink/50 tabular-nums">
                  {conv !== null ? fmtPct(conv) : '—'}
                </span>
              </li>
            );
          })}
        </ol>
      </ChartCard>

      {/* 10. Watch heatmap (CSS) */}
      <ChartCard title={t('charts.heatmap')} hint={t('heatmap.timezone')} className="lg:col-span-2">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="flex pl-10">
              {Array.from({ length: 24 }).map((_, h) => (
                <span key={h} className="flex-1 text-center font-mono text-[8px] text-ink/40">
                  {h % 3 === 0 ? h : ''}
                </span>
              ))}
            </div>
            {Array.from({ length: 7 }).map((_, day) => (
              <div key={day} className="flex items-center">
                <span className="w-10 shrink-0 font-mono text-[10px] text-ink/55">{dayLabels[day]}</span>
                {Array.from({ length: 24 }).map((_, hour) => {
                  const cell = data.heatmap.find((c) => c.day === day && c.hour === hour);
                  const intensity = cell ? cell.count / maxHeat : 0;
                  return (
                    <span
                      key={hour}
                      title={`${dayLabels[day]} ${hour}h — ${cell?.count ?? 0}`}
                      className="m-px h-4 flex-1 rounded-sm"
                      style={{ background: intensity === 0 ? 'rgba(16,32,74,0.05)' : `rgba(31,110,102,${0.15 + intensity * 0.85})` }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

function SplitBar({
  label,
  ht,
  fr,
  htPct,
  format,
}: {
  label: string;
  ht: number;
  fr: number;
  htPct: number;
  format: (n: number) => string;
}) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink/45">{label}</p>
      <div className="flex h-6 overflow-hidden rounded">
        <span className="flex items-center justify-start bg-ochre/80 px-2 font-mono text-[10px] text-[#1b1207]" style={{ width: `${htPct}%` }}>
          {htPct > 12 ? `ht ${format(ht)}` : ''}
        </span>
        <span className="flex flex-1 items-center justify-end bg-ink/80 px-2 font-mono text-[10px] text-paper-light">
          {100 - htPct > 12 ? `fr ${format(fr)}` : ''}
        </span>
      </div>
    </div>
  );
}
