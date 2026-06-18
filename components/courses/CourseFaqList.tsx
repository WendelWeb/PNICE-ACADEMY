'use client';

import { useState } from 'react';
import { IconPlus, IconMinus } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

export function CourseFaqList({
  items,
}: {
  items: { q: string; a: string }[];
}) {
  const [open, setOpen] = useState(0);

  return (
    <ul className="border-y border-ink/10">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <li key={i} className="border-b border-ink/10 last:border-b-0">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 py-4 text-left"
            >
              <span className="font-display text-base font-bold text-ink">
                {it.q}
              </span>
              {isOpen ? (
                <IconMinus size={18} className="shrink-0 text-ochre" />
              ) : (
                <IconPlus size={18} className="shrink-0 text-ink/40" />
              )}
            </button>
            <div
              className={cn(
                'grid transition-all duration-300',
                isOpen ? 'grid-rows-[1fr] pb-4' : 'grid-rows-[0fr]',
              )}
            >
              <p className="overflow-hidden text-[15px] leading-relaxed text-graphite/85">
                {it.a}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
