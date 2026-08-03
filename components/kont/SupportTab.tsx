'use client';

/**
 * /kont — Sipò tab (Stage: learner account). Support stops being one-way:
 * alongside the existing "file a ticket" form, the learner now sees their
 * ticket HISTORY (status chips) and each ticket's reply THREAD — the same
 * `support_replies` data the admin console writes — and can reply
 * themselves (authorType 'user'), which makes the admin email's "reponn
 * depi espas ou" a true statement.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  IconArrowLeft,
  IconCircleCheck,
  IconLifebuoy,
  IconLoader2,
  IconMessage2,
  IconPlus,
  IconSend,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { submitSupportTicketAction } from '@/lib/admin/support-actions';
import { replyToMyTicketAction } from '@/lib/learner/account-actions';
import type { TicketType } from '@/lib/admin/data';
import type { MyTicket, MyTicketReply } from '@/lib/learner/account';
import { SettingsCard, FieldShell, TextInput, TextAreaInput, SelectInput } from './ui';

function dateLabel(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusChip({ status }: { status: MyTicket['status'] }) {
  const t = useTranslations('kont.support.statusLabels');
  const tone =
    status === 'open'
      ? 'bg-ochre/15 text-ochre'
      : status === 'in_progress'
        ? 'bg-teal/10 text-teal'
        : 'bg-ink/8 text-ink/55';
  return (
    <span className={cn('shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide', tone)}>
      {t(status)}
    </span>
  );
}

/* ------------------------------- new ticket ------------------------------- */

function NewTicketForm({ onBack }: { onBack: () => void }) {
  const t = useTranslations('kont.support');
  const locale = useLocale();
  const router = useRouter();
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
            onClick={onBack}
            className={cn(buttonClasses('ghost', 'md'), 'mt-3 text-xs')}
          >
            {t('backToList')}
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

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !subject.trim() || !message.trim()}
            onClick={() =>
              start(async () => {
                setErr(null);
                const r = await submitSupportTicketAction({
                  type,
                  subject,
                  message,
                  // Stage 6: the ticket-received confirmation email follows
                  // the language the learner was browsing in.
                  locale: locale === 'fr' ? 'fr' : 'ht',
                });
                if (r.ok) {
                  setDone(true);
                  router.refresh();
                } else setErr(r.message ?? 'error');
              })
            }
            className={cn(buttonClasses('primary', 'md'))}
          >
            {pending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />}{' '}
            {t('submit')}
          </button>
          <button type="button" onClick={onBack} className={buttonClasses('ghost', 'md')}>
            {t('cancelNew')}
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}

/* --------------------------------- thread -------------------------------- */

function TicketThread({ ticket, onBack }: { ticket: MyTicket; onBack: () => void }) {
  const t = useTranslations('kont.support');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reply, setReply] = useState('');
  const [err, setErr] = useState(false);
  // Optimistic: replies sent this session render immediately; the
  // router.refresh() then folds them into the server-provided thread.
  const [localReplies, setLocalReplies] = useState<MyTicketReply[]>([]);

  const serverIds = new Set(ticket.replies.map((r) => r.id));
  const thread = [...ticket.replies, ...localReplies.filter((r) => !serverIds.has(r.id))];

  function send() {
    const body = reply.trim();
    if (!body) return;
    start(async () => {
      setErr(false);
      const r = await replyToMyTicketAction(ticket.id, body);
      if (r.ok) {
        setLocalReplies((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            authorType: 'user',
            authorName: t('you'),
            body,
            createdAt: new Date().toISOString(),
          },
        ]);
        setReply('');
        router.refresh();
      } else {
        setErr(true);
      }
    });
  }

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-1.5">
          <IconMessage2 size={14} /> {t('threadTitle')}
        </span>
      }
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/60 transition-colors hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
      >
        <IconArrowLeft size={14} />
        {t('backToList')}
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold leading-tight text-ink">{ticket.subject}</h3>
        <StatusChip status={ticket.status} />
      </div>
      <p className="mt-1 font-mono text-[11px] text-ink/45">
        {t('openedOn', { date: dateLabel(ticket.createdAt) })}
      </p>

      <ol className="mt-5 space-y-3">
        {/* The original message opens the thread. */}
        <li className="rounded-xl rounded-tl-sm border border-ink/12 bg-paper p-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('you')}</p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-graphite">
            {ticket.message}
          </p>
        </li>
        {thread.map((r) => (
          <li
            key={r.id}
            className={cn(
              'rounded-xl border p-4',
              r.authorType === 'admin'
                ? 'ml-4 rounded-tr-sm border-teal/25 bg-teal/[0.05] sm:ml-10'
                : 'rounded-tl-sm border-ink/12 bg-paper',
            )}
          >
            <p
              className={cn(
                'font-mono text-[10px] uppercase tracking-wide',
                r.authorType === 'admin' ? 'text-teal' : 'text-ink/45',
              )}
            >
              {r.authorType === 'admin' ? t('team') : t('you')} · {dateLabel(r.createdAt)}
            </p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-graphite">
              {r.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-ink/10 pt-5">
        <FieldShell id="ticketReply" label={t('replyLabel')}>
          <TextAreaInput
            id="ticketReply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('replyPlaceholder')}
            className="min-h-[90px]"
          />
        </FieldShell>
        {err && <p className="mt-2 font-mono text-[11px] text-stampred">{t('replyError')}</p>}
        <button
          type="button"
          disabled={pending || !reply.trim()}
          onClick={send}
          className={cn(buttonClasses('dark', 'md'), 'mt-3')}
        >
          {pending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />}{' '}
          {t('replySend')}
        </button>
      </div>
    </SettingsCard>
  );
}

/* ---------------------------------- tab ----------------------------------- */

export function SupportTab({ tickets }: { tickets: MyTicket[] }) {
  const t = useTranslations('kont.support');
  const [view, setView] = useState<'list' | 'new' | { ticketId: string }>(
    tickets.length === 0 ? 'new' : 'list',
  );

  if (view === 'new') {
    return <NewTicketForm onBack={() => setView('list')} />;
  }

  if (typeof view === 'object') {
    const ticket = tickets.find((x) => x.id === view.ticketId);
    if (ticket) return <TicketThread ticket={ticket} onBack={() => setView('list')} />;
  }

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-1.5">
          <IconLifebuoy size={14} /> {t('myTicketsTitle')}
        </span>
      }
    >
      {tickets.length === 0 ? (
        <p className="py-2 text-sm text-graphite/70">{t('noTickets')}</p>
      ) : (
        <ul className="-mx-5 divide-y divide-ink/8 sm:-mx-6">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => setView({ ticketId: ticket.id })}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ochre sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {ticket.subject}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-ink/45">
                    {dateLabel(ticket.updatedAt)} ·{' '}
                    {t('replyCount', { count: ticket.replies.length })}
                  </span>
                </span>
                <StatusChip status={ticket.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 border-t border-ink/10 pt-5">
        <button type="button" onClick={() => setView('new')} className={buttonClasses('primary', 'md')}>
          <IconPlus size={16} />
          {t('newTicket')}
        </button>
      </div>
    </SettingsCard>
  );
}
