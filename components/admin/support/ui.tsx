import { cn } from '@/lib/cn';
import type { TicketStatus, TicketType, WebhookStatus } from '@/lib/admin/data';

const ticketTone: Record<TicketStatus, string> = {
  open: 'bg-stampred/12 text-stampred',
  in_progress: 'bg-ochre/15 text-ochre',
  resolved: 'bg-teal/15 text-teal',
};
export function TicketStatusBadge({ status, label }: { status: TicketStatus; label: string }) {
  return (
    <span className={cn('inline-block rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', ticketTone[status])}>
      {label}
    </span>
  );
}

const typeTone: Record<TicketType, string> = {
  question: 'bg-ink/10 text-ink/65',
  bug: 'bg-ochre/15 text-ochre',
  refund: 'bg-stampred/12 text-stampred',
};
export function TicketTypeBadge({ type, label }: { type: TicketType; label: string }) {
  return (
    <span className={cn('inline-block rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', typeTone[type])}>
      {label}
    </span>
  );
}

const webhookTone: Record<WebhookStatus, string> = {
  processed: 'bg-teal/15 text-teal',
  failed: 'bg-stampred/12 text-stampred',
  ignored: 'bg-ink/10 text-ink/50',
};
export function WebhookStatusBadge({ status, label }: { status: WebhookStatus; label: string }) {
  return (
    <span className={cn('inline-block rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', webhookTone[status])}>
      {label}
    </span>
  );
}
