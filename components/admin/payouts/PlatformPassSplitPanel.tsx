'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconPlayerPlay, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { runPlatformPassSplitAction } from '@/lib/teacher/platform-pass-actions';

const KNOWN_MESSAGES = ['already_computed', 'empty_pool', 'db_required', 'forbidden', 'unauthorized'] as const;

/**
 * The /admin/repartition "lancer la répartition" button (Task: pro-rata
 * split of PNICE all-access revenue). Mirrors
 * components/admin/tx/PlatformPricePanel.tsx's useTransition + inline
 * status-message shape — no confirmation modal needed (unlike
 * components/admin/payouts/PayoutActions.tsx's mark-paid/reject, which need
 * a reference/note): running a period is IDEMPOTENT
 * (lib/teacher/platform-pass-payout.ts) — a second click on an
 * already-computed period is a safe, documented no-op, not a double-spend.
 */
export function PlatformPassSplitPanel({ period }: { period: string }) {
  const t = useTranslations('admin.repartition.run');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function run() {
    start(async () => {
      setMsg(null);
      const res = await runPlatformPassSplitAction(period);
      const key = res.message && (KNOWN_MESSAGES as readonly string[]).includes(res.message) ? res.message : res.ok ? 'success' : 'error';
      setMsg({ type: res.ok ? 'ok' : 'err', text: t(key) });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button type="button" disabled={pending} onClick={run} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
        {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconPlayerPlay size={14} />}
        {t('cta')}
      </button>
      {msg && (
        <p className={cn('font-mono text-[11px]', msg.type === 'ok' ? 'text-teal' : 'text-stampred')} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
