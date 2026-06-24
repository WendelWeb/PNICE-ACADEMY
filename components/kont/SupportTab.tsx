'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { IconLifebuoy, IconSend, IconLoader2, IconCircleCheck } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { submitSupportTicketAction } from '@/lib/admin/support-actions';
import type { TicketType } from '@/lib/admin/data';

const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper-light px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function SupportTab() {
  const t = useTranslations('kont.support');
  const [pending, start] = useTransition();
  const [type, setType] = useState<TicketType>('question');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-xl border border-teal/30 bg-teal/[0.06] p-6 text-center">
        <IconCircleCheck size={32} className="mx-auto text-teal" />
        <p className="mt-2 font-display text-lg font-bold text-ink">{t('sentTitle')}</p>
        <p className="mt-1 text-sm text-graphite/70">{t('sentBody')}</p>
        <button type="button" onClick={() => { setDone(false); setSubject(''); setMessage(''); }} className={cn(buttonClasses('ghost', 'md'), 'mt-4 text-xs')}>
          {t('sendAnother')}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
        <IconLifebuoy size={20} /> {t('title')}
      </h2>
      <p className="mt-1 text-sm text-graphite/70">{t('subtitle')}</p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('type')}</span>
          <select value={type} onChange={(e) => setType(e.target.value as TicketType)} className={cn(inputCls, 'cursor-pointer')}>
            <option value="question">{t('types.question')}</option>
            <option value="bug">{t('types.bug')}</option>
            <option value="refund">{t('types.refund')}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('subjectLabel')}</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('subjectPlaceholder')} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('messageLabel')}</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('messagePlaceholder')} className={cn(inputCls, 'min-h-[140px] resize-y')} />
        </label>

        {err && <p className="font-mono text-[11px] text-stampred">{t('error')}</p>}

        <button
          type="button"
          disabled={pending || !subject.trim() || !message.trim()}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await submitSupportTicketAction({ type, subject, message });
              if (r.ok) setDone(true);
              else setErr(r.message ?? 'error');
            })
          }
          className={cn(buttonClasses('primary', 'lg'), 'text-sm')}
        >
          {pending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />} {t('submit')}
        </button>
      </div>
    </div>
  );
}
