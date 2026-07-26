import { Stars } from './Stars';
import { cn } from '@/lib/cn';

/**
 * Compact avg + stars + count display (Task C3-T6) — used both near the
 * course title and as the reviews section heading. Purely presentational;
 * `countLabel` is passed in already-pluralized via `getTranslations`
 * (`reviews.countLabel`) so this component stays locale-agnostic.
 */
export function RatingSummary({
  avg,
  countLabel,
  emptyLabel,
  size = 16,
  className,
}: {
  avg: number | null;
  countLabel: string;
  emptyLabel: string;
  size?: number;
  className?: string;
}) {
  if (avg === null) {
    return <span className={cn('font-mono text-[11px] text-ink/45', className)}>{emptyLabel}</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Stars value={avg} size={size} />
      <span className="font-mono text-xs font-medium text-ink/75">{avg.toFixed(1)}</span>
      <span className="font-mono text-[11px] text-ink/45">({countLabel})</span>
    </span>
  );
}
