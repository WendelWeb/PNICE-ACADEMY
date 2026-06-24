'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconBan, IconCircleCheck, IconTrash, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { setPromoActiveAction, deletePromoCodeAction } from '@/lib/admin/marketing-actions';

const btn =
  'flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function PromoRowActions({
  id,
  code,
  isActive,
  deletable,
}: {
  id: string;
  code: string;
  isActive: boolean;
  /** usedCount === 0 → can be deleted (no history to lose). */
  deletable: boolean;
}) {
  const t = useTranslations('admin.marketing.promos');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | 'toggle' | 'delete'>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.ok) {
        setConfirm(null);
        router.refresh();
      } else {
        setErr(r.message ?? 'error');
      }
    });

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setConfirm('toggle')}
        className={cn(btn, isActive ? 'border-ink/15 text-ink/70 hover:bg-ink/[0.04]' : 'border-teal/30 text-teal hover:bg-teal/5')}
      >
        {isActive ? <IconBan size={12} /> : <IconCircleCheck size={12} />}
        {isActive ? t('actions.disable') : t('actions.enable')}
      </button>
      {deletable && (
        <button
          type="button"
          onClick={() => setConfirm('delete')}
          className={cn(btn, 'border-stampred/30 text-stampred hover:bg-stampred/5')}
        >
          <IconTrash size={12} /> {t('actions.delete')}
        </button>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-ink/12 bg-paper-light p-5">
            <h3 className="font-display text-base font-bold text-ink">
              {confirm === 'delete' ? t('actions.deleteTitle') : isActive ? t('actions.disableTitle') : t('actions.enableTitle')}
            </h3>
            <p className="mt-2 text-sm text-graphite/80">
              {confirm === 'delete'
                ? t('actions.deleteBody', { code })
                : isActive
                  ? t('actions.disableBody', { code })
                  : t('actions.enableBody', { code })}
            </p>
            {err && (
              <p className="mt-2 font-mono text-[11px] text-stampred">
                {err === 'has_redemptions' ? t('errors.has_redemptions') : err}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setConfirm(null); setErr(null); }} className={cn(btn, 'border-ink/15 text-ink/70 hover:bg-ink/[0.04] px-3 py-1.5')}>
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    confirm === 'delete' ? deletePromoCodeAction(id) : setPromoActiveAction(id, !isActive),
                  )
                }
                className={cn(
                  btn,
                  'px-3 py-1.5 text-paper-light',
                  confirm === 'delete' ? 'bg-stampred' : 'bg-ink',
                )}
              >
                {pending ? <IconLoader2 size={12} className="animate-spin" /> : null} {t('actions.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
