'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  IconMailFast,
  IconCircleCheck,
  IconAlertTriangle,
  IconMailOff,
  IconLoader2,
  IconSend,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { sendTestEmailAction, type TestEmailResult } from '@/lib/admin/support-actions';

/** Server-computed at render time from env only (booleans + the `from`
 *  string) — the API key itself is never passed to the client. */
export type EmailHealthInitial = {
  hasKey: boolean;
  live: boolean;
  from: string;
  /** Whether RESEND_FROM is actually set (vs. falling back to the hardcoded
   *  default domain, which is almost certainly unverified in Resend). */
  fromIsCustom: boolean;
};

export function EmailTestCard({ initial }: { initial: EmailHealthInitial }) {
  const t = useTranslations('admin.health.email');
  const locale = useLocale() as 'ht' | 'fr';
  const [result, setResult] = useState<TestEmailResult | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const r = await sendTestEmailAction(locale);
      setResult(r);
    });

  const tone = !initial.hasKey ? 'ink' : !initial.live ? 'ochre' : 'teal';
  const StatusIcon = !initial.hasKey ? IconMailOff : !initial.live ? IconAlertTriangle : IconCircleCheck;

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconMailFast size={13} /> {t('title')}
        </h2>
        <button
          type="button"
          disabled={pending}
          onClick={send}
          className="flex items-center gap-1 rounded-lg border border-ink/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/65 hover:bg-ink/[0.04] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre"
        >
          {pending ? <IconLoader2 size={13} className="animate-spin" /> : <IconSend size={13} />} {t('send')}
        </button>
      </div>

      <div className={cn('mt-3 flex items-start gap-3 rounded-lg p-3', tone === 'teal' ? 'bg-teal/[0.06]' : tone === 'ochre' ? 'bg-ochre/[0.06]' : 'bg-ink/[0.04]')}>
        <StatusIcon size={24} className={cn('shrink-0', tone === 'teal' ? 'text-teal' : tone === 'ochre' ? 'text-ochre' : 'text-ink/45')} />
        <div className="min-w-0 space-y-1.5">
          <p className={cn('text-sm font-medium', tone === 'teal' ? 'text-teal' : tone === 'ochre' ? 'text-ochre' : 'text-ink')}>
            {!initial.hasKey ? t('noKey') : !initial.live ? t('notLive') : t('ready')}
          </p>
          <p className="font-mono text-[11px] text-ink/60">
            {t('from')}: <span className="break-all text-ink/85">{initial.from}</span>
          </p>
          {!initial.fromIsCustom && (
            <p className="flex items-start gap-1 font-mono text-[10px] leading-snug text-ochre">
              <IconAlertTriangle size={12} className="mt-0.5 shrink-0" /> {t('fromWarning')}
            </p>
          )}
        </div>
      </div>

      <p className="mt-2 font-mono text-[10px] text-ink/40">{t('selfNote')}</p>

      {result && (
        <div className={cn('mt-3 rounded-lg p-3', result.ok ? 'bg-teal/[0.06]' : result.skipped ? 'bg-ochre/[0.06]' : 'bg-stampred/[0.06]')}>
          {result.ok ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-teal">
                <IconCircleCheck size={16} /> {t('sent')}
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink/70">
                {t('to')}: <span className="text-ink">{result.to}</span>
              </p>
              {result.id && (
                <p className="mt-0.5 font-mono text-[11px] text-ink/55">
                  {t('resendId')}: <span className="text-ink/80">{result.id}</span>
                </p>
              )}
            </>
          ) : result.skipped ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-ochre">
                <IconAlertTriangle size={16} /> {t('skipped')}
              </p>
              {result.reason && <p className="mt-1 font-mono text-[11px] text-ink/70">{t(`reason.${result.reason}`)}</p>}
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-stampred">
                <IconAlertTriangle size={16} /> {t('failed')}
              </p>
              {result.error && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-ink/[0.03] p-2 font-mono text-[10px] leading-relaxed text-stampred/90">
                  {result.error}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
