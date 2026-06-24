'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useTranslations } from 'next-intl';
import type { DropoffPoint } from '@/lib/admin/data';

const tickFont = { fontSize: 10, fill: '#2B2B28', fontFamily: 'IBM Plex Mono, monospace' };

export function DropoffChart({ points }: { points: DropoffPoint[] }) {
  const t = useTranslations('admin.engagement.dropoff');
  const data = points.map((p) => ({ pos: `L${p.position}`, pct: Math.round(p.pct) }));

  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="rgba(16,32,74,0.08)" vertical={false} />
          <XAxis dataKey="pos" tick={tickFont} tickLine={false} axisLine={{ stroke: 'rgba(16,32,74,0.08)' }} />
          <YAxis tick={tickFont} tickLine={false} axisLine={false} width={36} domain={[0, 100]} tickFormatter={(v) => v + '%'} />
          <Tooltip
            contentStyle={{ background: '#F2EEE4', border: '1px solid rgba(16,32,74,0.15)', borderRadius: 8, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}
            formatter={(v) => Number(v) + '%'}
          />
          <Line type="monotone" dataKey="pct" name={t('legend')} stroke="#1F6E66" strokeWidth={2.5} dot={{ r: 3, fill: '#1F6E66' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
