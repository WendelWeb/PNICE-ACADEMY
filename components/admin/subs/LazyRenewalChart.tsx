'use client';

import dynamic from 'next/dynamic';
import type { RenewalDay } from '@/lib/admin/data';

// Recharts is lazy/code-split (client-only) so it stays out of the shared bundle.
const Chart = dynamic(() => import('./RenewalChart').then((m) => m.RenewalChart), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-ink/[0.04] motion-reduce:animate-none" />,
});

export function LazyRenewalChart({ series }: { series: RenewalDay[] }) {
  return <Chart series={series} />;
}
