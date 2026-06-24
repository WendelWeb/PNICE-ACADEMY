'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useTranslations } from 'next-intl';
import type { RenewalDay } from '@/lib/admin/data';

const tickFont = { fontSize: 10, fill: '#2B2B28', fontFamily: 'IBM Plex Mono, monospace' };

export function RenewalChart({ series }: { series: RenewalDay[] }) {
  const t = useTranslations('admin.subs.renewals');
  const data = series.map((d) => ({
    date: d.date,
    count: d.count,
    cumulative: Math.round(d.cumulativeCents / 100),
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="rgba(16,32,74,0.08)" vertical={false} />
          <XAxis dataKey="date" tick={tickFont} tickLine={false} axisLine={{ stroke: 'rgba(16,32,74,0.08)' }} interval={2} />
          <YAxis yAxisId="l" tick={tickFont} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <YAxis yAxisId="r" orientation="right" tick={tickFont} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => '$' + v} />
          <Tooltip
            contentStyle={{ background: '#F2EEE4', border: '1px solid rgba(16,32,74,0.15)', borderRadius: 8, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} />
          <Bar yAxisId="l" dataKey="count" name={t('chartCount')} fill="#1F6E66" radius={[3, 3, 0, 0]} />
          <Line yAxisId="r" type="monotone" dataKey="cumulative" name={t('chartCumulative')} stroke="#D98E2B" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
