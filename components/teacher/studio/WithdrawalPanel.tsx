'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconLoader2, IconSend, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { fmtUsdCents, fmtDate, fmtPeriodLabel } from '@/lib/admin/format';
import { requestWithdrawalAction } from '@/lib/teacher/studio-actions';
import type { LedgerRow, WithdrawalRow } from '@/lib/teacher/profile';

const KNOWN_ERRORS = [
  'below_threshold',
  'insufficient_balance',
  'pending_exists',
  'no_payout_method',
  'invalid_amount',
  'forbidden',
  'db_required',
] as const;

function errorLabel(t: ReturnType<typeof useTranslations>, message?: string): string {
  const key = message && (KNOWN_ERRORS as readonly string[]).includes(message) ? message : 'generic';
  return t(`balance.error.${key}`);
}

/**
 * The studio dashboard's money panel (Task C3-T4): balance (SUM(net_cents),
 * re-derived server-side by lib/teacher/studio.ts — never trusted as a
 * cached number here), the withdrawal request form (disabled below the
 * payout threshold or while a request is already pending — the same three
 * guards `requestWithdrawalAction` re-checks server-side), and the recent
 * earnings ledger.
 */
const WITHDRAWAL_STATUS_TONE: Record<WithdrawalRow['status'], string> = {
  pending: 'bg-ochre/15 text-ochre',
  paid: 'bg-teal/15 text-teal',
  rejected: 'bg-stampred/15 text-stampred',
};

export function WithdrawalPanel({
  balanceCents,
  thresholdCents,
  pendingWithdrawalCents,
  videoQuotaMinutes,
  ledger,
  withdrawals,
  locale,
}: {
  balanceCents: number;
  thresholdCents: number;
  pendingWithdrawalCents: number | null;
  videoQuotaMinutes: number | null;
  ledger: LedgerRow[];
  /** Every withdrawal request this teacher has made, newest first (Task
   *  Stage 7 — money visibility: a rejected payout, and the admin's note
   *  explaining why, used to vanish with no trace once the pending amount
   *  cleared). */
  withdrawals: WithdrawalRow[];
  locale: string;
}) {
  const t = useTranslations('teach.studio');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(balanceCents / 100)));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const belowThreshold = balanceCents < thresholdCents;
  const hasPending = pendingWithdrawalCents !== null;
  const disabled = belowThreshold || hasPending;

  function submit() {
    const amountCents = Math.round((Number(amount) || 0) * 100);
    start(async () => {
      setMsg(null);
      const res = await requestWithdrawalAction(amountCents);
      if (res.ok) {
        setMsg({ type: 'ok', text: t('balance.success') });
        setOpen(false);
        router.refresh();
      } else {
        setMsg({ type: 'err', text: errorLabel(t, res.message) });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-ink/12 bg-paper-light p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">{t('balance.title')}</p>
          <p className="mt-1 font-display text-3xl font-black text-ink">{fmtUsdCents(balanceCents)}</p>
          <p className="mt-1 font-mono text-[11px] text-ink/45">{t('balance.threshold', { amount: fmtUsdCents(thresholdCents) })}</p>
          {videoQuotaMinutes != null && (
            <p className="mt-1 font-mono text-[11px] text-ink/45">{t('balance.quota', { minutes: videoQuotaMinutes })}</p>
          )}
          {withdrawals.length > 0 && (
            <a href="#istorik-retrait" className="mt-1.5 inline-block font-mono text-[11px] text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal">
              {t('balance.history.viewCta')}
            </a>
          )}
        </div>

        <div className="text-right">
          {hasPending ? (
            <p className="font-mono text-[11px] text-ochre">
              {t('balance.pendingNote', { amount: fmtUsdCents(pendingWithdrawalCents!) })}
            </p>
          ) : !open ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpen(true)}
              className={cn(buttonClasses('primary', 'md'), 'text-xs')}
            >
              <IconSend size={14} /> {t('balance.requestCta')}
            </button>
          ) : null}
          {belowThreshold && !hasPending && (
            <p className="mt-1 font-mono text-[10px] text-ink/40">{t('balance.error.below_threshold')}</p>
          )}
        </div>
      </div>

      {open && !hasPending && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 bg-paper p-3">
          <label className="flex items-center gap-1.5 font-mono text-sm text-ink/70">
            $
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 rounded border border-ink/15 bg-paper-light px-2 py-1"
            />
          </label>
          <button type="button" disabled={pending} onClick={submit} className={cn(buttonClasses('primary', 'sm'))}>
            {pending ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
            {t('balance.submit')}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={cn(buttonClasses('ghost', 'sm'))}>
            {t('balance.cancel')}
          </button>
        </div>
      )}

      {msg && (
        <p className={cn('mt-3 flex items-center gap-1.5 font-mono text-[11px]', msg.type === 'ok' ? 'text-teal' : 'text-stampred')}>
          {msg.type === 'err' && <IconAlertTriangle size={12} />} {msg.text}
        </p>
      )}

      <div className="mt-6 border-t border-ink/10 pt-4">
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">{t('ledger.title')}</p>
        {ledger.length === 0 ? (
          <p className="mt-2 font-mono text-xs text-graphite/55">{t('ledger.empty')}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {ledger.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 font-mono text-[12px]">
                <span className="text-ink/60">
                  {fmtDate(row.createdAt, locale as 'ht' | 'fr')} ·{' '}
                  {row.kind === 'platform_pass'
                    ? t('ledger.kind.platform_pass', { period: fmtPeriodLabel(row.note, locale as 'ht' | 'fr') })
                    : t(`ledger.kind.${row.kind}`)}
                </span>
                <span className={cn('tabular-nums', row.netCents < 0 ? 'text-stampred' : 'text-ink')}>
                  {row.netCents < 0 ? '-' : '+'}
                  {fmtUsdCents(Math.abs(row.netCents))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div id="istorik-retrait" className="mt-6 scroll-mt-24 border-t border-ink/10 pt-4">
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">{t('balance.history.title')}</p>
        {withdrawals.length === 0 ? (
          <p className="mt-2 font-mono text-xs text-graphite/55">{t('balance.history.empty')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {withdrawals.map((w) => (
              <li key={w.id} className="rounded-lg border border-ink/10 bg-paper p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-ink/60">{fmtDate(w.createdAt, locale as 'ht' | 'fr')}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-medium tabular-nums text-ink">{fmtUsdCents(w.amountCents)}</span>
                    <span className={cn('rounded px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide', WITHDRAWAL_STATUS_TONE[w.status])}>
                      {t(`balance.history.status.${w.status}`)}
                    </span>
                  </span>
                </div>
                {w.status === 'rejected' && w.note && (
                  <p className="mt-1.5 rounded border border-stampred/25 bg-stampred/5 p-2 text-xs leading-relaxed text-graphite/80">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-stampred">{t('balance.history.noteLabel')}</span>
                    <br />
                    {w.note}
                  </p>
                )}
                {w.status === 'paid' && w.reference && (
                  <p className="mt-1.5 font-mono text-[11px] text-ink/50">
                    {t('balance.history.referenceLabel')}: {w.reference}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
