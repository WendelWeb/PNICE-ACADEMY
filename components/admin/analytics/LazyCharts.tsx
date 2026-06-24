'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/cn';
import type { AnalyticsData } from '@/lib/admin/data';

/**
 * Lazy boundary: Recharts is heavy + client-only, so the chart bundle is loaded
 * with ssr:false and code-split here — it never enters the initial/shared bundle.
 */
const Charts = dynamic(() => import('./AnalyticsCharts').then((m) => m.AnalyticsCharts), {
  ssr: false,
  loading: () => <ChartsSkeleton />,
});

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-56 animate-pulse rounded-xl border border-ink/12 bg-paper-light motion-reduce:animate-none',
            i % 3 === 0 && 'lg:col-span-2',
          )}
        />
      ))}
    </div>
  );
}

export function LazyCharts(props: { data: AnalyticsData; locale: 'ht' | 'fr' }) {
  return <Charts {...props} />;
}
