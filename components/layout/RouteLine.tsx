import { cn } from '@/lib/cn';

type RouteLineProps = {
  /** Dash color: `ink` (default, the page-wide thread) or `teal` (the
   *  post-manifest journey thread on the homepage hero). */
  tone?: 'ink' | 'teal';
  /** `left` (default) pins a full-height thread to the content column's left
   *  edge, absolutely positioned behind the page — the original behavior.
   *  `center` renders a short, centered vertical segment inline (e.g. under
   *  the hero manifest). */
  align?: 'left' | 'center';
  /** Whether the ambient dash-drift loop runs (CSS still gates it behind
   *  `prefers-reduced-motion`). Defaults to `true` for the `teal` tone and
   *  `false` for `ink`, matching prior behavior for each. */
  animated?: boolean;
  className?: string;
};

/**
 * Decorative "ligne de route" — a subtle dotted thread that runs as the
 * visual through-line of the page. Purely decorative: aria-hidden.
 *
 * Backward compatible: `<RouteLine />` renders exactly the original
 * full-height, left-pinned, ink-colored, static thread hidden on small
 * screens. `tone="teal"` + `align="center"` covers the short animated
 * segment used under the homepage hero manifest.
 */
export function RouteLine({
  tone = 'ink',
  align = 'left',
  animated = tone === 'teal',
  className,
}: RouteLineProps) {
  const threadClasses = cn(
    'route-thread',
    tone === 'teal' && 'route-thread-teal',
    animated && 'route-thread-animated',
  );

  if (align === 'center') {
    return (
      <div
        aria-hidden="true"
        className={cn(threadClasses, 'mx-auto h-14 w-[2px] md:h-20', className)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-0 hidden lg:block',
        className,
      )}
    >
      <div className="mx-auto h-full max-w-page px-6 md:px-8">
        <div className={cn(threadClasses, 'ml-[1px] h-full w-px opacity-70')} />
      </div>
    </div>
  );
}
