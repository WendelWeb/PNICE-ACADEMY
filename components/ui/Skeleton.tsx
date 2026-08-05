import { cn } from '@/lib/cn';

/**
 * Shared loading-skeleton primitives (Stage 8 — launch hygiene), used by the
 * six `loading.tsx` route boundaries the audit flagged as missing (a bare
 * white flash on every heavy-DB route while data resolves). Paper-toned,
 * reduced-motion-safe (`.skeleton-pulse` in globals.css) — pure visual
 * placeholders, `aria-hidden` since the real accessible signal is
 * `<LoadingStatus>`'s `role="status"` text below.
 */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton-pulse rounded-lg bg-ink/10', className)}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'overflow-hidden rounded-xl border border-ink/12 bg-paper-light',
        className,
      )}
    >
      <div className="skeleton-pulse aspect-[16/9] bg-ink/10" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton-pulse h-3 w-2/3 rounded bg-ink/10" />
        <div className="skeleton-pulse h-2.5 w-1/3 rounded bg-ink/10" />
      </div>
    </div>
  );
}

/**
 * The one accessible signal every skeleton needs: screen-reader users get an
 * announced "loading" state (kreyòl first, français second) instead of
 * silence while every visual block above is `aria-hidden`.
 */
export function LoadingStatus() {
  return (
    <span role="status" className="sr-only">
      N ap chaje… / Chargement…
    </span>
  );
}
