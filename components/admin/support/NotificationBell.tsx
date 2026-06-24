'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  IconBell,
  IconShoppingBag,
  IconCreditCardOff,
  IconReceiptRefund,
  IconCircleMinus,
  IconPlugConnectedX,
  IconChecks,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDateTime } from '@/lib/admin/format';
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/lib/admin/support-actions';
import type { AdminNotification, AdminNotifKind, NotificationFeed } from '@/lib/admin/data';

const KIND_ICON: Record<AdminNotifKind, typeof IconBell> = {
  sale: IconShoppingBag,
  payment_failed: IconCreditCardOff,
  refund_request: IconReceiptRefund,
  sub_canceled: IconCircleMinus,
  webhook_error: IconPlugConnectedX,
};

export function NotificationBell() {
  const t = useTranslations('admin.notifications');
  const locale = useLocale() as 'ht' | 'fr';
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const f = await getNotificationsAction();
    if (f) setFeed(f);
  }, []);

  // Poll every 30s (Task 5/6).
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = feed?.unread ?? 0;
  const critical = feed?.criticalUnread ?? 0;

  const markRead = (n: AdminNotification) => {
    if (n.read) return;
    start(async () => {
      await markNotificationReadAction(n.id);
      refresh();
    });
  };
  const markAll = () =>
    start(async () => {
      await markAllNotificationsReadAction();
      refresh();
    });

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('aria')}
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink/65 hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
      >
        <IconBell size={19} />
        {unread > 0 && (
          <span className={cn('absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full px-1 font-mono text-[9px] font-bold text-paper-light', critical > 0 ? 'bg-stampred' : 'bg-ochre')}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[88vw] overflow-hidden rounded-xl border border-ink/15 bg-paper-light shadow-lg">
          <div className="flex items-center justify-between border-b border-ink/10 px-3 py-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-ink/55">
              {t('title')} {unread > 0 && <span className="text-ochre">({unread})</span>}
            </span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={markAll} disabled={unread === 0} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/55 hover:text-ink disabled:opacity-40">
                <IconChecks size={13} /> {t('markAll')}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-ink/45 hover:text-ink"><IconX size={15} /></button>
            </span>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto">
            {(feed?.items.length ?? 0) === 0 && (
              <li className="px-3 py-8 text-center font-mono text-xs text-graphite/55">{t('empty')}</li>
            )}
            {feed?.items.map((n) => {
              const Icon = KIND_ICON[n.kind];
              const isCritical = n.severity === 'critical';
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n)}
                    className={cn('flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-ink/[0.03]', !n.read && 'bg-ochre/[0.05]')}
                  >
                    <span className={cn('mt-0.5 shrink-0', isCritical ? 'text-stampred' : 'text-ink/45')}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn('font-mono text-[10px] uppercase tracking-wide', isCritical ? 'text-stampred' : 'text-ink/55')}>
                          {t(`kind.${n.kind}`)}
                        </span>
                        {!n.read && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isCritical ? 'bg-stampred' : 'bg-ochre')} />}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink/85">
                        {n.userName ?? '—'}
                        {n.amountCents != null && <span className="ml-1 font-mono text-ink tabular-nums">· {fmtUsdCents(n.amountCents)}</span>}
                      </span>
                      {n.detail && <span className="block truncate font-mono text-[10px] text-ink/45">{n.detail}</span>}
                      <span className="block font-mono text-[10px] text-ink/35 tabular-nums">{fmtDateTime(n.createdAt, locale)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
