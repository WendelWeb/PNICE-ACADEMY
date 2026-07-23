import { cn } from '@/lib/cn';

type CourseProgressRouteProps = {
  /** Total number of lessons — becomes the number of "station" dots. */
  total: number;
  /** Lessons completed so far. */
  done: number;
  className?: string;
};

/**
 * The dashboard's per-course progress visual (U7): a horizontal companion to
 * `components/layout/RouteLine` — a dotted teal "route" whose traveled
 * portion (`.route-fill`) fills to the completion percentage, with a station
 * dot per lesson. Purely decorative (the real numbers live in the text next
 * to it), server-renderable, no client JS: the fill's width is set inline so
 * it is always correct with or without JS, and its one-shot "fill in" motion
 * is a pure CSS animation gated in globals.css exactly like the homepage's
 * `.route-thread-animated` (respects both OS and in-app reduced-motion).
 */
export function CourseProgressRoute({
  total,
  done,
  className,
}: CourseProgressRouteProps) {
  const stations = Math.max(total, 1);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div aria-hidden="true" className={cn('relative h-5', className)}>
      <div className="route-thread-h absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full" />
      <div
        className="route-fill absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-teal"
        style={{ width: `${pct}%` }}
      />
      <div className="absolute inset-0 flex items-center justify-between">
        {Array.from({ length: stations }).map((_, i) => {
          const state = i < done ? 'done' : i === done && done < total ? 'next' : 'upcoming';
          return (
            <span
              key={i}
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-paper-light',
                state === 'done' && 'border-teal bg-teal',
                state === 'next' && 'border-ochre',
                state === 'upcoming' && 'border-ink/20',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
