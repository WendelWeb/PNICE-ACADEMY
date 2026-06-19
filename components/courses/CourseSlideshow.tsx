'use client';

import { useEffect, useState } from 'react';
import { SmartImage } from '@/components/ui/SmartImage';
import { cn } from '@/lib/cn';

/**
 * Card slideshow: cross-fades slowly between a course's images.
 * - starts on a RANDOM frame per card on load
 * - each card rotates on its own slow, staggered rhythm (not in sync)
 * - reduced-motion users (and single-image cards) see a static image
 */
export function CourseSlideshow({
  images,
  alt,
  sizes,
  priority = false,
}: {
  images: string[];
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  const count = images.length;
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (count < 2) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Random starting frame so cards don't all show the same image.
    setActive(Math.floor(Math.random() * count));
    if (reduce) return;

    // Slow + staggered: each card picks its own interval and an offset start,
    // so they never flip at the same rhythm.
    const interval = 15000 + Math.floor(Math.random() * 15000); // 15s–30s
    const offset = Math.floor(Math.random() * 8000);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startId = setTimeout(() => {
      setActive((a) => (a + 1) % count);
      intervalId = setInterval(
        () => setActive((a) => (a + 1) % count),
        interval,
      );
    }, offset + interval);

    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [count]);

  return (
    <>
      {images.map((src, i) => (
        <SmartImage
          key={`${src}-${i}`}
          src={src}
          alt={i === 0 ? alt : ''}
          fill
          priority={priority && i === 0}
          sizes={sizes}
          className={cn(
            'object-cover transition-opacity duration-[1200ms] ease-in-out',
            i === active ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}
    </>
  );
}
