'use client';

import { useEffect, useState } from 'react';

/**
 * Generic sidebar count badge (Stage 7 — backstage). Mirrors
 * `components/admin/support/SupportNavBadge.tsx`'s shape exactly (poll every
 * 60s, render nothing at 0/null) but takes its count source as a prop so the
 * teachers/payouts/courses queues can each plug in their own capability-gated
 * server action (`getTeacherApplicationsBadgeAction`/`getWithdrawalsBadgeAction`/
 * `getCourseReviewBadgeAction`) instead of three near-identical copies of
 * this component.
 */
export function AdminNavBadge({ fetchCount }: { fetchCount: () => Promise<number> }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const n = await fetchCount();
      if (alive) setCount(n);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetchCount]);

  if (!count) return null;
  return (
    <span className="ml-auto grid min-w-[18px] place-items-center rounded-full bg-stampred px-1 font-mono text-[9px] font-bold tabular-nums text-paper-light">
      {count > 99 ? '99+' : count}
    </span>
  );
}
