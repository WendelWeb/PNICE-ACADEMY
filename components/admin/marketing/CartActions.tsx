'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconClockExclamation, IconMailForward, IconLoader2, IconCheck } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { markCartAbandonedAction, remindCartAction } from '@/lib/admin/marketing-actions';

const btn =
  'flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre disabled:opacity-50';

/** Open cart → mark abandoned (sim of the 2h cron). */
export function MarkAbandonedButton({ id }: { id: string }) {
  const t = useTranslations('admin.marketing.carts');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await markCartAbandonedAction(id); router.refresh(); })}
      className={cn(btn, 'border-ochre/30 text-ochre hover:bg-ochre/5')}
    >
      {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconClockExclamation size={12} />}
      {t('markAbandoned')}
    </button>
  );
}

/** Abandoned cart (connected user) → send one reminder email. */
export function RemindCartButton({ id, reminded }: { id: string; reminded: boolean }) {
  const t = useTranslations('admin.marketing.carts');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (reminded) {
    return (
      <span className={cn(btn, 'border-teal/30 text-teal')}>
        <IconCheck size={12} /> {t('reminded')}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await remindCartAction(id);
            if (r.ok) router.refresh();
            else setErr(r.message ?? 'error');
          })
        }
        className={cn(btn, 'border-ink/15 text-ink/70 hover:bg-ink/[0.04]')}
      >
        {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconMailForward size={12} />}
        {t('remind')}
      </button>
      {err && <span className="font-mono text-[9px] text-stampred">{err}</span>}
    </span>
  );
}
