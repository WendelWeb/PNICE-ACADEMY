'use client';

import { useEffect, useState } from 'react';
import { getSupportBadgeAction } from '@/lib/admin/support-actions';

/** Sidebar badge: count of open, unassigned tickets. Polls every 60s (Task 1). */
export function SupportNavBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const n = await getSupportBadgeAction();
      if (alive) setCount(n);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!count) return null;
  return (
    <span className="ml-auto grid min-w-[18px] place-items-center rounded-full bg-stampred px-1 font-mono text-[9px] font-bold tabular-nums text-paper-light">
      {count > 99 ? '99+' : count}
    </span>
  );
}
