import { getTranslations } from 'next-intl/server';
import {
  IconChevronUp,
  IconChevronDown,
  IconSelector,
  IconBrandPaypal,
  IconCreditCard,
  IconDeviceMobile,
  IconCurrencyBitcoin,
  IconClockExclamation,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDateTime, fmtInt } from '@/lib/admin/format';
import { htgFromCentsAt } from '@/lib/admin/settings';
import { paramsOf, mergeParams, type RawSearchParams } from '@/lib/admin/users-query';
import type { TxRow, TxSortKey, PaymentMethod, PaymentStatus } from '@/lib/admin/data';

const BASE = '/admin/transactions';

const methodIcon: Record<PaymentMethod, TablerIcon> = {
  paypal: IconBrandPaypal,
  card: IconCreditCard,
  moncash: IconDeviceMobile,
  natcash: IconDeviceMobile,
  crypto: IconCurrencyBitcoin,
};

const statusTone: Record<PaymentStatus, string> = {
  succeeded: 'text-teal',
  pending: 'text-ochre',
  failed: 'text-stampred',
  refunded: 'text-ink/50',
};

export async function TxTable({
  rows,
  rate,
  searchParams,
  locale,
  canRefund,
  RefundButton,
  ReceiptButtons,
}: {
  rows: TxRow[];
  rate: number;
  searchParams: RawSearchParams;
  locale: 'ht' | 'fr';
  canRefund: boolean;
  RefundButton: React.ComponentType<{ userId: string; paymentId: string }>;
  ReceiptButtons: React.ComponentType<{ userId: string; paymentId: string }>;
}) {
  const t = await getTranslations('admin.tx');
  const params = paramsOf(searchParams);
  const curSort = params.get('sort') ?? 'date';
  const curDir = params.get('dir') ?? 'desc';

  function SortHeader({ col, label }: { col: TxSortKey; label: string }) {
    const active = curSort === col;
    const nextDir = active && curDir === 'desc' ? 'asc' : 'desc';
    const Icon = !active ? IconSelector : curDir === 'desc' ? IconChevronDown : IconChevronUp;
    return (
      <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">
        <Link href={`${BASE}${mergeParams(params, { sort: col, dir: nextDir })}`} className={cn('inline-flex flex-row-reverse items-center gap-1 hover:text-ink', active && 'text-ink')}>
          {label}
          <Icon size={13} className={active ? 'text-ochre' : 'text-ink/35'} />
        </Link>
      </th>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-ink/12">
      <table className="w-full min-w-[940px] border-collapse text-sm">
        <thead className="bg-paper-light">
          <tr className="border-b border-ink/12 text-left">
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.user')}</th>
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.product')}</th>
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.method')}</th>
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.ref')}</th>
            <SortHeader col="amount" label={t('col.amount')} />
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.status')}</th>
            <SortHeader col="date" label={t('col.date')} />
            <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const MIcon = methodIcon[r.method];
            return (
              <tr
                key={r.id}
                className={cn(
                  'border-b border-ink/8 last:border-0',
                  r.status === 'refunded' && 'bg-stampred/[0.03]',
                )}
              >
                <td className="px-3 py-2.5">
                  <Link href={`/admin/utilisateurs/${r.userId}`} className="group block min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink group-hover:text-ochre">
                      {r.userName}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-ink/45">{r.userEmail}</span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className="block text-[13px] text-ink/85">
                    {locale === 'ht' ? r.productTitle_ht : r.productTitle_fr}
                  </span>
                  {r.productCode && (
                    <span className="font-mono text-[10px] uppercase text-ink/40">{r.productCode}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-[13px] text-ink/75">
                    <MIcon size={15} className="text-ink/55" />
                    {t(`method.${r.method}`)}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[10px] text-ink/45">{r.id}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <span className="block font-mono text-sm font-medium text-ink tabular-nums">
                    {fmtUsdCents(r.amountCents)}
                  </span>
                  <span className="block font-mono text-[10px] text-ink/45 tabular-nums">
                    {fmtInt(htgFromCentsAt(r.amountCents, rate))} HTG
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('flex items-center gap-1 font-mono text-[11px] uppercase', statusTone[r.status])}>
                    {r.stalePending && <IconClockExclamation size={13} />}
                    {t(`status.${r.status}`)}
                  </span>
                  {r.stalePending && (
                    <span className="block font-mono text-[9px] text-ochre">{t('stale')}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] text-ink/65 tabular-nums">
                  {fmtDateTime(r.createdAt, locale)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="flex flex-col items-end gap-1">
                    {r.status === 'succeeded' && (
                      <>
                        <ReceiptButtons userId={r.userId} paymentId={r.id} />
                        {canRefund && <RefundButton userId={r.userId} paymentId={r.id} />}
                      </>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
