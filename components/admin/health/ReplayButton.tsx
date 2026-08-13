'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconRefresh, IconLoader2, IconArchive } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { replayWebhookAction, dismissWebhookAction } from '@/lib/admin/support-actions';

/** Server refusals that have their own sentence — anything else falls back to
 *  the generic one rather than showing the owner a raw code. */
const KNOWN = new Set([
  'not_found',
  'not_failed',
  'no_payload',
  'no_reference',
  'replay_unpaid',
  'replay_unknown_order',
  'replay_not_configured',
  'replay_error',
]);

/**
 * « Rejouer » now performs a REAL re-drive (see `replayWebhookAction`), so it
 * can genuinely fail — and when it does, the row must stay red. Every refusal
 * is spelled out in the owner's language instead of a silent success.
 *
 * « Classer » is the separate, deliberate exit for an alert that will never be
 * replayable. It demands a reason precisely because it is the button that
 * makes a problem disappear from the screen without solving it.
 */
export function ReplayButton({ id, canAct }: { id: string; canAct: boolean }) {
  const t = useTranslations('admin.health.webhooks');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  if (!canAct) return <span className="font-mono text-[10px] text-ink/35">—</span>;

  const message = (code: string) => (KNOWN.has(code) ? t(`replayErr.${code}`) : t('replayErr.generic'));

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await replayWebhookAction(id);
              if (r.ok) router.refresh();
              else setErr(message(r.message ?? 'generic'));
            })
          }
          className={cn('flex items-center gap-1 rounded-lg border border-ochre/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ochre hover:bg-ochre/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre')}
        >
          {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconRefresh size={12} />} {t('replay')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => { setDismissing((v) => !v); setErr(null); }}
          aria-expanded={dismissing}
          className="flex items-center gap-1 rounded-lg border border-ink/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/55 hover:bg-ink/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <IconArchive size={12} /> {t('dismiss')}
        </button>
      </span>

      {dismissing && (
        <span className="flex flex-col items-end gap-1">
          <label className="sr-only" htmlFor={`dismiss-${id}`}>{t('dismissReason')}</label>
          <input
            id={`dismiss-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('dismissReason')}
            className="w-56 rounded border border-ink/20 bg-paper-light px-2 py-1 text-[11px] text-ink placeholder:text-ink/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
          />
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() =>
              start(async () => {
                setErr(null);
                const r = await dismissWebhookAction(id, reason);
                if (r.ok) { setDismissing(false); setReason(''); router.refresh(); }
                else setErr(message(r.message ?? 'generic'));
              })
            }
            className="rounded-lg border border-stampred/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-stampred hover:bg-stampred/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stampred"
          >
            {t('dismissConfirm')}
          </button>
        </span>
      )}

      {err && <span className="max-w-56 text-right font-mono text-[9px] leading-snug text-stampred">{err}</span>}
    </span>
  );
}
