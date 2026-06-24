import { cn } from '@/lib/cn';
import type { PromoStatus, CartReminderStatus, DiscountType } from '@/lib/admin/data';

/**
 * Marketing presentation primitives. Tone is FUNCTIONAL only — teal = live/healthy,
 * ochre = needs attention/scheduled, stampred = off, ink/muted = inactive.
 */

const promoTone: Record<PromoStatus, string> = {
  active: 'bg-teal/15 text-teal',
  scheduled: 'bg-ochre/15 text-ochre',
  expired: 'bg-ink/10 text-ink/50',
  depleted: 'bg-ink/10 text-ink/50',
  disabled: 'bg-stampred/12 text-stampred',
};

export function PromoStatusBadge({ status, label }: { status: PromoStatus; label: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
        promoTone[status],
      )}
    >
      {label}
    </span>
  );
}

const cartTone: Record<CartReminderStatus, string> = {
  never: 'bg-ink/10 text-ink/55',
  reminded: 'bg-ochre/15 text-ochre',
  converted: 'bg-teal/15 text-teal',
};

export function CartStatusBadge({ status, label }: { status: CartReminderStatus; label: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
        cartTone[status],
      )}
    >
      {label}
    </span>
  );
}

/** "20 %" or "10 $" from a discount type + stored value (cents for fixed). */
export function discountLabel(type: DiscountType, value: number): string {
  return type === 'percent' ? `${value} %` : `${Math.round(value / 100)} $`;
}
