'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { IconLifebuoy, IconSend, IconLoader2, IconCircleCheck } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { submitSupportTicketAction } from '@/lib/admin/support-actions';
import type { TicketType } from '@/lib/admin/data';
import { SettingsCard, FieldShell, TextInput, TextAreaInput, SelectInput } from './ui';

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
      <SettingsCard>
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-teal/10">
            <IconCircleCheck size={26} className="text-teal" />
          </span>
          <p className="mt-1 font-display text-lg font-bold text-ink">{t('sentTitle')}</p>
          <p className="text-sm text-graphite/70">{t('sentBody')}</p>
          <button
            type="button"
            onClick={() => {
              setDone(false);
              setSubject('');
              setMessage('');
            }}
            className={cn(buttonClasses('ghost', 'md'), 'mt-3 text-xs')}
          >
            {t('sendAnother')}
          </button>
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-1.5">
          <IconLifebuoy size={14} /> {t('title')}
        </span>
      }
    >
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <div className="mt-5 space-y-4">
        <FieldShell id="ticketType" label={t('type')}>
          <SelectInput
            id="ticketType"
            value={type}
            onChange={(e) => setType(e.target.value as TicketType)}
          >
            <option value="question">{t('types.question')}</option>
            <option value="bug">{t('types.bug')}</option>
            <option value="refund">{t('types.refund')}</option>
          </SelectInput>
        </FieldShell>
        <FieldShell id="ticketSubject" label={t('subjectLabel')}>
          <TextInput
            id="ticketSubject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('subjectPlaceholder')}
          />
        </FieldShell>
        <FieldShell id="ticketMessage" label={t('messageLabel')}>
          <TextAreaInput
            id="ticketMessage"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messagePlaceholder')}
            className="min-h-[140px]"
          />
        </FieldShell>

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
          className={cn(buttonClasses('primary', 'md'))}
        >
          {pending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />} {t('submit')}
        </button>
      </div>
    </SettingsCard>
  );
}
