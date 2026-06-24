'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';
import { RANGE_KEYS, type RangeKey } from '@/lib/admin/period';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper';
const fieldCls =
  'rounded border border-ink/15 bg-paper-light px-2 py-1 font-mono text-[11px] text-ink ' + focusRing;

export function PeriodSelector() {
  const t = useTranslations('admin.analytics.period');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = (sp.get('range') as RangeKey) || '30d';

  const [from, setFrom] = useState(sp.get('from') ?? '');
  const [to, setTo] = useState(sp.get('to') ?? '');

  const go = (patch: Record<string, string | null>) =>
    router.push(pathname + mergeParams(new URLSearchParams(sp.toString()), patch));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(RANGE_KEYS.filter((r) => r !== 'custom') as RangeKey[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => go({ range: r, from: null, to: null })}
          aria-pressed={current === r}
          className={cn(
            'rounded px-2.5 py-1 font-mono text-[11px] transition-colors motion-reduce:transition-none',
            focusRing,
            current === r ? 'bg-ink text-paper-light' : 'bg-ink/[0.06] text-ink/70 hover:bg-ink/10',
          )}
        >
          {t(r)}
        </button>
      ))}

      <span className="mx-1 h-4 w-px bg-ink/15" aria-hidden />

      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        aria-label={t('from')}
        className={cn(fieldCls, 'cursor-pointer')}
      />
      <span className="font-mono text-[11px] text-ink/45">→</span>
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        aria-label={t('to')}
        className={cn(fieldCls, 'cursor-pointer')}
      />
      <button
        type="button"
        disabled={!from || !to}
        onClick={() => go({ range: 'custom', from, to })}
        className={cn(
          'rounded px-2.5 py-1 font-mono text-[11px] transition-colors motion-reduce:transition-none disabled:opacity-40',
          focusRing,
          current === 'custom' ? 'bg-ochre text-[#1b1207]' : 'bg-ochre/15 text-ochre hover:bg-ochre/25',
        )}
      >
        {t('apply')}
      </button>
    </div>
  );
}
