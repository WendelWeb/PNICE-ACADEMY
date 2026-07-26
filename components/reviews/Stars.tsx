'use client';

import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

/**
 * Read-only OR interactive 1..5 star row (Task C3-T6). Read-only mode is
 * used inside server components (rating badge, review list, /prof) just
 * fine — a 'use client' component can be imported into a server component
 * tree; it only needs the client runtime for the interactive picker's
 * onClick handlers.
 */
export function Stars({
  value,
  size = 16,
  interactive = false,
  onChange,
  className,
}: {
  /** 0..5, may be fractional in read-only mode (rounded to the nearest star). */
  value: number;
  size?: number;
  interactive?: boolean;
  onChange?: (n: number) => void;
  className?: string;
}) {
  const rounded = Math.round(value);
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={!interactive ? `${value.toFixed(1)} / 5` : undefined}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= rounded;
        const Icon = filled ? IconStarFilled : IconStar;
        if (!interactive) {
          return (
            <Icon key={n} size={size} className={filled ? 'text-ochre' : 'text-ink/20'} aria-hidden="true" />
          );
        }
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === rounded}
            aria-label={String(n)}
            onClick={() => onChange?.(n)}
            className="p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light"
          >
            <Icon
              size={size}
              className={cn(filled ? 'text-ochre' : 'text-ink/25', 'transition-colors hover:text-ochre/70')}
            />
          </button>
        );
      })}
    </span>
  );
}
