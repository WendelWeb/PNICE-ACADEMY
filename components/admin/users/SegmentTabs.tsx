'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';
import type { UserType } from '@/lib/admin/data';
import { fmtInt } from '@/lib/admin/format';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper';

export function SegmentTabs({
  counts,
}: {
  counts: { all: number } & Record<UserType, number>;
}) {
  const t = useTranslations('admin.users.types');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get('type') ?? '';

  const tabs: { value: string; label: string; count: number }[] = [
    { value: '', label: t('all'), count: counts.all },
    { value: 'active_subscriber', label: t('active_subscriber'), count: counts.active_subscriber },
    { value: 'one_off', label: t('one_off'), count: counts.one_off },
    { value: 'free', label: t('free'), count: counts.free },
  ];

  const select = (value: string) =>
    router.push(pathname + mergeParams(new URLSearchParams(sp.toString()), { type: value || null }));

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-ink/10 pb-px">
      {tabs.map((tab) => {
        const active = current === tab.value;
        return (
          <button
            key={tab.value || 'all'}
            type="button"
            onClick={() => select(tab.value)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors motion-reduce:transition-none',
              focusRing,
              active
                ? 'border-ochre font-semibold text-ink'
                : 'border-transparent text-ink/60 hover:text-ink',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                active ? 'bg-ochre/15 text-ochre' : 'bg-ink/8 text-ink/50',
              )}
            >
              {fmtInt(tab.count)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
