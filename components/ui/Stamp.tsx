'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type StampProps = {
  children: React.ReactNode;
  /** Final rotation angle, in degrees — should usually match the wrapped `Sceau`'s own `rotate`. */
  rotate?: number;
  /** Play immediately on mount instead of waiting for the viewport (e.g. hero, merci page). */
  immediate?: boolean;
  /** Stagger delay in ms, applied to the transition itself. */
  delay?: number;
  className?: string;
  /**
   * Escape hatch for a THIRD trigger — a click, not a viewport entry or
   * mount (e.g. the studio's publication seal button, Task D1). When
   * provided, `Stamp` gives up its own viewport/`immediate` logic entirely
   * and just mirrors this boolean — the caller owns the `false → true`
   * transition (typically local `useState`, flipped in an `onClick`).
   * Omitted (the default, every existing call site) keeps the original
   * self-triggered behaviour unchanged.
   */
  stamped?: boolean;
};

/**
 * Plays a one-time "stamp-down" entrance for its child (typically a
 * `Sceau`): scale 1.6 → 1, rotating into place, fading in — the signature
 * gesture reused across the hero manifest, the merci page and certificate
 * verification (PART A3/A4). Fires once, either on viewport entry
 * (IntersectionObserver, like `Reveal`), immediately with `immediate`, or
 * under full external control via the `stamped` prop (a click, Task D1).
 *
 * Reduced-motion users see the final, settled state instantly — this is
 * CSS-driven (see `.stamp` / `.stamp.is-stamped` in globals.css), the same
 * pattern as `.reveal`.
 */
export function Stamp({
  children,
  rotate = -8,
  immediate = false,
  delay = 0,
  className,
  stamped: stampedProp,
}: StampProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [stampedState, setStamped] = useState(false);
  const controlled = stampedProp !== undefined;
  const stamped = controlled ? stampedProp : stampedState;

  useEffect(() => {
    if (controlled) return; // the caller owns the trigger entirely — see `stamped` prop doc.
    if (immediate) {
      setStamped(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setStamped(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setStamped(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate, controlled]);

  return (
    <span
      ref={ref}
      className={cn('stamp', stamped && 'is-stamped', className)}
      style={
        {
          '--stamp-rot': `${rotate}deg`,
          transitionDelay: `${delay}ms`,
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  );
}
