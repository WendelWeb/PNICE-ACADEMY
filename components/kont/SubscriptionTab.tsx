'use client';

/**
 * /kont — Abònman tab (Stage: learner account). Replaces the 'Byento
 * disponib' stub with the learner's REAL subscriptions (kind, price,
 * start, renewal, status) + a Stripe billing-portal button, and the full
 * purchase history with receipt downloads underneath — a paying subscriber
 * can finally SEE and MANAGE what they pay for.
 *
 * Env-gated politely: when the portal can't open (no Stripe key, no
 * customer, network), the button degrades to an explanation + a link to the
 * support tab instead of a dead click.
 */
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  IconCreditCard,
  IconExternalLink,
  IconFileDownload,
  IconLoader2,
  IconReceipt,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import type { MyAccountData, MyPurchase, MySubscription } from '@/lib/learner/account';
import { SettingsCard } from './ui';

function moneyLabel(cents: number | null): string {
  if (cents === null) return '—';
  const usd = cents / 100;
  return `${Number.isInteger(usd) ? usd : usd.toFixed(2)}$`;
}

/** Kreyòl has no Intl locale — dates render with French formatting for both
 *  site locales (the same fallback lib/admin/format.ts uses). */
function dateLabel(isoDate: string | null): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusChip({ status }: { status: MySubscription['status'] }) {
  const t = useTranslations('kont.subscription.statusLabels');
  const tone =
    status === 'active'
      ? 'bg-teal/10 text-teal'
      : status === 'past_due'
        ? 'bg-ochre/15 text-ochre'
        : status === 'canceled'
          ? 'bg-stampred/10 text-stampred'
          : 'bg-ink/8 text-ink/60';
  return (
    <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide', tone)}>
      {t(status)}
    </span>
  );
}

function SubscriptionCard({
  sub,
  onOpenSupport,
}: {
  sub: MySubscription;
  onOpenSupport: () => void;
}) {
  const t = useTranslations('kont.subscription');
  const locale = useLocale();
  const [opening, setOpening] = useState(false);
  const [portalFailed, setPortalFailed] = useState(false);

  async function openPortal() {
    setOpening(true);
    setPortalFailed(false);
    try {
      const res = await fetch(`/api/billing-portal?locale=${locale === 'fr' ? 'fr' : 'ht'}`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setPortalFailed(true);
    } catch {
      setPortalFailed(true);
    }
    setOpening(false);
  }

  const kindLabel =
    sub.kind === 'platform' ? t('kindPlatform') : t('kindTeacher', { name: sub.teacherName ?? '—' });

  return (
    <div className="rounded-xl border border-ink/12 bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-lg font-bold leading-tight text-ink">{kindLabel}</p>
        <StatusChip status={sub.status} />
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('price')}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">
            {t('pricePerMonth', { price: moneyLabel(sub.priceCents) })}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('startedAt')}</dt>
          <dd className="mt-0.5 text-sm text-graphite/80">{dateLabel(sub.startedAt)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/45">
            {sub.status === 'canceled' || sub.cancelAtPeriodEnd ? t('endsAt') : t('renewsAt')}
          </dt>
          <dd className="mt-0.5 text-sm text-graphite/80">{dateLabel(sub.currentPeriodEnd)}</dd>
        </div>
      </dl>

      {sub.cancelAtPeriodEnd && sub.status !== 'canceled' ? (
        <p className="mt-3 font-mono text-[11px] text-ochre">{t('cancelScheduled')}</p>
      ) : null}

      {sub.status !== 'canceled' ? (
        <div className="mt-5">
          {sub.portalEligible ? (
            <>
              <button
                type="button"
                onClick={openPortal}
                disabled={opening}
                className={buttonClasses('dark', 'md')}
              >
                {opening ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconExternalLink size={16} />
                )}
                {t('manage')}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-graphite/60">{t('manageHint')}</p>
              {portalFailed ? (
                <p className="mt-2 max-w-md text-xs leading-relaxed text-stampred">
                  {t('portalUnavailable')}{' '}
                  <button
                    type="button"
                    onClick={onOpenSupport}
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    {t('portalSupportLink')}
                  </button>
                </p>
              ) : null}
            </>
          ) : (
            <p className="max-w-md text-xs leading-relaxed text-graphite/65">
              {t('portalUnavailable')}{' '}
              <button
                type="button"
                onClick={onOpenSupport}
                className="underline underline-offset-2 hover:text-ink"
              >
                {t('portalSupportLink')}
              </button>
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PurchaseRow({ purchase }: { purchase: MyPurchase }) {
  const t = useTranslations('kont.subscription.purchases');
  const locale = useLocale();
  const item =
    purchase.productType === 'subscription'
      ? t('itemPass')
      : (locale === 'fr' ? purchase.titleFr : purchase.titleHt) ?? purchase.courseSlug ?? '—';
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <span className="w-24 shrink-0 font-mono text-[11px] text-ink/50">
        {dateLabel(purchase.dateIso)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink" title={item}>
        {item}
      </span>
      <span
        className={cn(
          'font-mono text-xs tabular-nums',
          purchase.status === 'refunded' ? 'text-stampred line-through' : 'text-ink',
        )}
      >
        {moneyLabel(purchase.amountCents)}
      </span>
      {purchase.status === 'refunded' ? (
        <span className="rounded bg-stampred/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-stampred">
          {t('refunded')}
        </span>
      ) : null}
      {purchase.receiptAvailable ? (
        <a
          href={`/api/receipt/${purchase.id}?locale=${locale === 'fr' ? 'fr' : 'ht'}`}
          className="inline-flex items-center gap-1 font-mono text-[11px] text-teal underline-offset-2 hover:underline"
        >
          <IconFileDownload size={13} />
          {t('receipt')}
        </a>
      ) : null}
    </li>
  );
}

export function SubscriptionTab({
  account,
  onOpenSupport,
}: {
  account: MyAccountData;
  onOpenSupport: () => void;
}) {
  const t = useTranslations('kont.subscription');
  // Canceled passes stay visible only while nothing active replaces them —
  // the history below already tells the full money story.
  const active = account.subscriptions.filter((s) => s.status !== 'canceled');
  const shown = active.length > 0 ? active : account.subscriptions.slice(0, 1);

  return (
    <div className="space-y-6">
      <SettingsCard
        title={
          <span className="flex items-center gap-1.5">
            <IconCreditCard size={14} /> {t('title')}
          </span>
        }
      >
        {shown.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-graphite/70">{t('empty')}</p>
            <Link href="/pri" className={cn(buttonClasses('primary', 'md'), 'mt-4')}>
              {t('emptyCta')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {shown.map((sub) => (
              <SubscriptionCard key={sub.id} sub={sub} onOpenSupport={onOpenSupport} />
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={
          <span className="flex items-center gap-1.5">
            <IconReceipt size={14} /> {t('purchases.title')}
          </span>
        }
      >
        {account.purchases.length === 0 ? (
          <p className="py-2 text-sm text-graphite/70">{t('purchases.empty')}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-ink/8 sm:-mx-6">
            {account.purchases.map((p) => (
              <PurchaseRow key={p.id} purchase={p} />
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  );
}
