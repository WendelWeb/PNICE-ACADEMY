import { cn } from '@/lib/cn';
import type { SubDisplayStatus } from '@/lib/admin/data';

export function SubStatusBadge({ status, label }: { status: SubDisplayStatus; label: string }) {
  const cls =
    status === 'active'
      ? 'bg-teal/12 text-teal'
      : status === 'pending_renewal'
        ? 'bg-ochre/15 text-ochre'
        : status === 'past_due'
          ? 'bg-stampred/12 text-stampred'
          : 'bg-ink/8 text-ink/60';
  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', cls)}>
      {label}
    </span>
  );
}

/** Renewal type: auto (card/PayPal) vs manual (MonCash/NatCash/Crypto — needs attention). */
export function AutoBadge({ auto, label }: { auto: boolean; label: string }) {
  return (
    <span className={cn('font-mono text-[10px] uppercase tracking-wide', auto ? 'text-teal' : 'text-ochre')}>
      {label}
    </span>
  );
}
