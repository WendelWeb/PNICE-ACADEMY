'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconFlask, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { simulateRedemptionAction } from '@/lib/admin/marketing-actions';

const inputCls =
  'rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

/**
 * MOCK testing aid (Task 10): records a redemption so the full loop — create →
 * use → appears in promo_redemptions → detail — is verifiable before payment
 * providers are wired. Disappears once real checkout completion lands.
 */
export function SimulateRedemption({
  code,
  sampleUsers,
}: {
  code: string;
  sampleUsers: { id: string; name: string }[];
}) {
  const t = useTranslations('admin.marketing.promos');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState(sampleUsers[0]?.id ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className="rounded-xl border border-dashed border-ochre/40 bg-ochre/[0.04] p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ochre">
        <IconFlask size={13} /> {t('sim.title')}
      </h2>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-graphite/60">{t('sim.note')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
          {sampleUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !userId}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await simulateRedemptionAction(code, userId);
              setMsg({ ok: r.ok, text: r.ok ? t('sim.done') : r.message ?? 'error' });
              if (r.ok) router.refresh();
            })
          }
          className={cn(buttonClasses('ghost', 'md'), 'text-xs')}
        >
          {pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconFlask size={14} />} {t('sim.run')}
        </button>
        {msg && <span className={cn('font-mono text-[11px]', msg.ok ? 'text-teal' : 'text-stampred')}>{msg.text}</span>}
      </div>
    </section>
  );
}
