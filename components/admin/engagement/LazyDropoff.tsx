'use client';

import dynamic from 'next/dynamic';
import type { DropoffPoint } from '@/lib/admin/data';

const Chart = dynamic(() => import('./DropoffChart').then((m) => m.DropoffChart), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-lg bg-ink/[0.04] motion-reduce:animate-none" />,
});

export function LazyDropoff({ points }: { points: DropoffPoint[] }) {
  return <Chart points={points} />;
}
