'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  IconPlayerPlay,
  IconCircleCheck,
  IconAlertTriangle,
  IconPlugConnected,
  IconLoader2,
  IconRefresh,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/admin/format';
import { recheckBunnyAction } from '@/lib/admin/support-actions';
import type { BunnyStatus } from '@/lib/admin/health/bunny';

function fmtBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function BunnyStatusCard({ initial }: { initial: BunnyStatus }) {
  const t = useTranslations('admin.health.bunny');
  const locale = useLocale() as 'ht' | 'fr';
  const [status, setStatus] = useState<BunnyStatus>(initial);
  const [pending, start] = useTransition();

  const recheck = () =>
    start(async () => {
      const s = await recheckBunnyAction();
      if (s) setStatus(s);
    });

  const tone = !status.configured ? 'ink' : status.ok ? 'teal' : 'stampred';
  const Icon = !status.configured ? IconPlugConnected : status.ok ? IconCircleCheck : IconAlertTriangle;

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconPlayerPlay size={13} /> {t('title')}
        </h2>
        <button
          type="button"
          disabled={pending}
          onClick={recheck}
          className="flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/65 hover:bg-ink/[0.04] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
        >
          {pending ? <IconLoader2 size={13} className="animate-spin" /> : <IconRefresh size={13} />} {t('recheck')}
        </button>
      </div>

      <div className={cn('mt-3 flex items-start gap-3 rounded-lg p-3', tone === 'teal' ? 'bg-teal/[0.06]' : tone === 'stampred' ? 'bg-stampred/[0.06]' : 'bg-ink/[0.04]')}>
        <Icon size={24} className={cn('shrink-0', tone === 'teal' ? 'text-teal' : tone === 'stampred' ? 'text-stampred' : 'text-ink/45')} />
        <div className="min-w-0">
          {!status.configured ? (
            <>
              <p className="text-sm font-medium text-ink">{t('notConfigured')}</p>
              <p className="mt-0.5 font-mono text-[11px] text-ink/55">{t('notConfiguredNote')}</p>
            </>
          ) : status.ok ? (
            <>
              <p className="text-sm font-medium text-teal">{t('ok')}</p>
              <p className="mt-1 font-mono text-xs text-ink/70 tabular-nums">
                {t('videos')}: <span className="font-semibold text-ink">{status.videoCount ?? '—'}</span>
                {status.storageBytes != null && <> · {t('storage')}: <span className="font-semibold text-ink">{fmtBytes(status.storageBytes)}</span></>}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-stampred">{t('failed')}</p>
              {status.error && <p className="mt-1 break-words font-mono text-[11px] text-stampred/90">{status.error}</p>}
            </>
          )}
          <p className="mt-1.5 font-mono text-[10px] text-ink/40">{t('lastCheck')}: {fmtDateTime(status.checkedAt, locale)}</p>
        </div>
      </div>
    </section>
  );
}
