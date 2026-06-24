'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconWalletOff, IconCoinFilled, IconLoader2, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { addManualCreditAction } from '@/lib/admin/marketing-actions';

const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

/**
 * Support tool: add (or correct) a credit on a user's account — e.g. a referral
 * bonus that didn't post automatically. Audited server-side.
 */
export function AddCreditButton({ userId }: { userId: string }) {
  const t = useTranslations('admin.marketing.credit');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const val = Number(amount);
  const valid = Number.isFinite(val) && val !== 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
        <IconCoinFilled size={14} /> {t('add')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
                <IconCoinFilled size={16} /> {t('title')}
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-ink/50 hover:text-ink">
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs leading-snug text-graphite/65">{t('hint')}</p>

            <label className="mt-3 block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('amount')}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-ink/70">$</span>
                <input type="number" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5" className={cn(inputCls, 'font-mono tabular-nums')} />
              </div>
              <span className="mt-1 flex items-center gap-1 font-mono text-[10px] text-ink/45">
                <IconWalletOff size={11} /> {t('negativeHint')}
              </span>
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('note')}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} className={inputCls} />
            </label>

            {err && <p className="mt-2 font-mono text-[11px] text-stampred">{err}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!valid || pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const r = await addManualCreditAction(userId, val, note);
                    if (r.ok) { setOpen(false); setAmount(''); setNote(''); router.refresh(); }
                    else setErr(r.message ?? 'error');
                  })
                }
                className={cn(buttonClasses('primary', 'md'), 'text-xs')}
              >
                {pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
