'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconRefresh, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { replayWebhookAction } from '@/lib/admin/support-actions';

export function ReplayButton({ id, canAct }: { id: string; canAct: boolean }) {
  const t = useTranslations('admin.health.webhooks');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (!canAct) return <span className="font-mono text-[10px] text-ink/35">—</span>;

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await replayWebhookAction(id);
            if (r.ok) router.refresh();
            else setErr(r.message ?? 'error');
          })
        }
        className={cn('flex items-center gap-1 rounded-lg border border-ochre/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ochre hover:bg-ochre/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre')}
      >
        {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconRefresh size={12} />} {t('replay')}
      </button>
      {err && <span className="font-mono text-[9px] text-stampred">{err}</span>}
    </span>
  );
}
