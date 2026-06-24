'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconUserCheck, IconLoader2, IconArrowRight } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { assignTicketAction, setTicketStatusAction } from '@/lib/admin/support-actions';
import type { TicketStatus } from '@/lib/admin/data';

const STATUS_FLOW: TicketStatus[] = ['open', 'in_progress', 'resolved'];

export function TicketControls({
  ticketId,
  status,
  assignedAdminId,
  admins,
  canAct,
}: {
  ticketId: string;
  status: TicketStatus;
  assignedAdminId: string | null;
  admins: { id: string; name: string }[];
  canAct: boolean;
}) {
  const t = useTranslations('admin.support');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [assignee, setAssignee] = useState(assignedAdminId ?? '');

  if (!canAct) return null;

  const onAssign = (id: string) => {
    setAssignee(id);
    const admin = admins.find((a) => a.id === id) ?? null;
    start(async () => {
      await assignTicketAction(ticketId, id || null, admin?.name ?? null);
      router.refresh();
    });
  };

  const setStatus = (s: TicketStatus) =>
    start(async () => {
      await setTicketStatusAction(ticketId, s);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/12 bg-paper-light p-3">
      {/* assign */}
      <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconUserCheck size={14} /> {t('detail.assign')}
        <select
          value={assignee}
          disabled={pending}
          onChange={(e) => onAssign(e.target.value)}
          className="rounded-lg border border-ink/15 bg-paper px-2 py-1 font-mono text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ochre"
        >
          <option value="">{t('detail.unassigned')}</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      {/* status transitions */}
      <div className="ml-auto flex items-center gap-1.5">
        {STATUS_FLOW.map((s, i) => {
          const isCurrent = s === status;
          return (
            <span key={s} className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pending || isCurrent}
                onClick={() => setStatus(s)}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(
                  'rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:cursor-default',
                  isCurrent
                    ? s === 'resolved'
                      ? 'border-teal/40 bg-teal/15 text-teal'
                      : s === 'in_progress'
                        ? 'border-ochre/40 bg-ochre/15 text-ochre'
                        : 'border-stampred/40 bg-stampred/12 text-stampred'
                    : 'border-ink/15 text-ink/60 hover:bg-ink/[0.04]',
                )}
              >
                {t(`status.${s}`)}
              </button>
              {i < STATUS_FLOW.length - 1 && <IconArrowRight size={12} className="text-ink/25" />}
            </span>
          );
        })}
        {pending && <IconLoader2 size={14} className="animate-spin text-ink/40" />}
      </div>
    </div>
  );
}
