'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in ms. */
  delay?: number;
};

/**
 * Reveals its children on scroll using a native IntersectionObserver.
 * Reduced-motion users and no-JS visitors see content immediately
 * (handled in globals.css).
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn('reveal', shown && 'is-visible', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
