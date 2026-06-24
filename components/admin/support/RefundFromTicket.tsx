'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconReceiptRefund, IconLoader2, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { refundFromTicketAction } from '@/lib/admin/support-actions';

/**
 * Task 3: "Traiter le remboursement" on a refund ticket. Reuses the Phase A Lot 3
 * refund logic server-side; resolves the ticket on success. Only rendered when
 * the viewer holds `transactions.refund` (support agents triage; admins refund).
 */
export function RefundFromTicket({
  ticketId,
  summary,
}: {
  ticketId: string;
  summary: { userName: string; amount: string; method: string };
}) {
  const t = useTranslations('admin.support');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(buttonClasses('primary', 'md'), 'bg-stampred text-xs hover:bg-stampred/90')}>
        <IconReceiptRefund size={15} /> {t('refund.cta')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
                <IconReceiptRefund size={16} /> {t('refund.title')}
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-ink/50 hover:text-ink"><IconX size={18} /></button>
            </div>

            <dl className="mt-3 space-y-1.5 rounded-lg bg-paper p-3 font-mono text-xs">
              <div className="flex justify-between gap-3"><dt className="text-ink/50">{t('refund.user')}</dt><dd className="text-ink">{summary.userName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink/50">{t('refund.amount')}</dt><dd className="font-semibold text-ink tabular-nums">{summary.amount}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink/50">{t('refund.method')}</dt><dd className="uppercase text-ink">{summary.method}</dd></div>
            </dl>

            <p className="mt-3 flex items-start gap-2 text-sm text-graphite/80">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-stampred" /> {t('refund.warning')}
            </p>
            {err && <p className="mt-2 font-mono text-[11px] text-stampred">{err === 'not_refundable' ? t('refund.notRefundable') : err}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('refund.cancel')}</button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const r = await refundFromTicketAction(ticketId);
                    if (r.ok) { setOpen(false); router.refresh(); }
                    else setErr(r.message ?? 'error');
                  })
                }
                className={cn(buttonClasses('primary', 'md'), 'bg-stampred text-xs hover:bg-stampred/90')}
              >
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('refund.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
