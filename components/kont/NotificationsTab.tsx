'use client';

/**
 * /kont — Notifikasyon tab (Stage: learner account). An HONEST minimal
 * feed: only events derivable from data we really store — purchases,
 * refunds, certificates, subscription changes (lib/learner/account.ts's
 * `deriveAccountEvents`). No invented notification system, no stub.
 */
import { useLocale, useTranslations } from 'next-intl';
import {
  IconBell,
  IconCertificate,
  IconCreditCard,
  IconReceipt,
  IconReceiptRefund,
} from '@tabler/icons-react';
import type { AccountEvent } from '@/lib/learner/account';
import { SettingsCard } from './ui';

function dateLabel(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function eventIcon(kind: AccountEvent['kind']) {
  switch (kind) {
    case 'certificate':
      return <IconCertificate size={16} className="text-ochre" />;
    case 'refund':
      return <IconReceiptRefund size={16} className="text-stampred" />;
    case 'subscription_started':
    case 'subscription_canceled':
    case 'subscription_past_due':
      return <IconCreditCard size={16} className="text-teal" />;
    default:
      return <IconReceipt size={16} className="text-teal" />;
  }
}

export function NotificationsTab({ events }: { events: AccountEvent[] }) {
  const t = useTranslations('kont.notifications');
  const locale = useLocale();

  function label(e: AccountEvent): string {
    const title = (locale === 'fr' ? e.titleFr : e.titleHt) ?? '';
    switch (e.kind) {
      case 'purchase':
        return title ? t('purchase', { title }) : t('purchasePass');
      case 'refund':
        return title ? t('refund', { title }) : t('refundPass');
      case 'certificate':
        return t('certificate', { title });
      case 'subscription_started':
        return t('subscriptionStarted');
      case 'subscription_canceled':
        return t('subscriptionCanceled');
      case 'subscription_past_due':
        return t('subscriptionPastDue');
    }
  }

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-1.5">
          <IconBell size={14} /> {t('title')}
        </span>
      }
    >
      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <IconBell size={28} className="text-ink/25" />
          <p className="max-w-xs text-sm leading-relaxed text-graphite/70">{t('empty')}</p>
        </div>
      ) : (
        <ul className="-mx-5 divide-y divide-ink/8 sm:-mx-6">
          {events.map((e, i) => (
            <li key={`${e.kind}-${e.at}-${i}`} className="flex items-start gap-3 px-4 py-3.5 sm:px-6">
              <span className="mt-0.5 shrink-0">{eventIcon(e.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug text-ink">{label(e)}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-ink/45">
                  {dateLabel(e.at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
