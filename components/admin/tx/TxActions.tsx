'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { IconReceipt2, IconMail, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { resendReceiptAction } from '@/lib/admin/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/** "Voir le reçu" (placeholder PDF) + "Renvoyer par email" (audited action). */
export function ReceiptButtons({ userId, paymentId }: { userId: string; paymentId: string }) {
  const t = useTranslations('admin.tx.receipt');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {/* Real PDF lands with the receipt pipeline (Phase 2 Part D). */}
      <span
        className="inline-flex items-center gap-1 font-mono text-[10px] text-ink/45"
        title={t('viewSoon')}
      >
        <IconReceipt2 size={12} /> {t('view')}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await resendReceiptAction(userId, paymentId);
            setMsg(res.ok ? t('sent') : t('error'));
          })
        }
        className={cn('inline-flex items-center gap-1 font-mono text-[10px] text-teal hover:underline', focusRing)}
      >
        {pending ? <IconLoader2 size={11} className="animate-spin" /> : <IconMail size={11} />}
        {t('resend')}
      </button>
      {msg && <span className="font-mono text-[10px] text-ink/50">{msg}</span>}
    </span>
  );
}
