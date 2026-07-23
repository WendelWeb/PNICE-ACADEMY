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
};

/**
 * Plays a one-time "stamp-down" entrance for its child (typically a
 * `Sceau`): scale 1.6 → 1, rotating into place, fading in — the signature
 * gesture reused across the hero manifest, the merci page and certificate
 * verification (PART A3/A4). Fires once, either on viewport entry
 * (IntersectionObserver, like `Reveal`) or immediately with `immediate`.
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
}: StampProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
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
  }, [immediate]);

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
