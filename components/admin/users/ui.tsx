import { cn } from '@/lib/cn';
import type { UserType, UserStatus, SubscriptionStatus } from '@/lib/admin/data';

/** Small chip. Tone follows the admin rules: teal = healthy, ochre = neutral
 *  highlight, stampred = risk/alert, graphite = muted. */
function Chip({ tone, children }: { tone: 'teal' | 'ochre' | 'stampred' | 'graphite'; children: React.ReactNode }) {
  const cls = {
    teal: 'bg-teal/12 text-teal',
    ochre: 'bg-ochre/15 text-ochre',
    stampred: 'bg-stampred/12 text-stampred',
    graphite: 'bg-ink/8 text-ink/60',
  }[tone];
  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', cls)}>
      {children}
    </span>
  );
}

export function TypeBadge({ type, label }: { type: UserType; label: string }) {
  const tone = type === 'active_subscriber' ? 'teal' : type === 'one_off' ? 'ochre' : 'graphite';
  return <Chip tone={tone}>{label}</Chip>;
}

export function StatusBadge({ status, label }: { status: UserStatus; label: string }) {
  if (status === 'active') return <Chip tone="teal">{label}</Chip>;
  if (status === 'suspended') return <Chip tone="ochre">{label}</Chip>;
  return <Chip tone="stampred">{label}</Chip>;
}

export function SubBadge({ status, label }: { status: SubscriptionStatus; label: string }) {
  const tone = status === 'active' ? 'teal' : status === 'past_due' ? 'stampred' : 'graphite';
  return <Chip tone={tone}>{label}</Chip>;
}

export function CountryBadge({ country, label }: { country: 'HT' | 'diaspora'; label: string }) {
  return <Chip tone={country === 'HT' ? 'ochre' : 'graphite'}>{label}</Chip>;
}
