'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconPlus, IconMinus } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { cn } from '@/lib/cn';

export function Faq() {
  const t = useTranslations('home.faq');
  const items = t.raw('items') as { q: string; a: string }[];
  const [open, setOpen] = useState(0);

  return (
    <Section>
      <Container className="max-w-3xl">
        <div className="text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-ink md:text-4xl">
            {t('title')}
          </h2>
        </div>

        <ul className="mt-10 border-y border-ink/10">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <li key={i} className="border-b border-ink/10 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="font-display text-lg font-bold text-ink">
                    {it.q}
                  </span>
                  {isOpen ? (
                    <IconMinus size={20} className="shrink-0 text-ochre" />
                  ) : (
                    <IconPlus size={20} className="shrink-0 text-ink/40" />
                  )}
                </button>
                <div
                  className={cn(
                    'grid transition-all duration-300',
                    isOpen ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]',
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
      </Container>
    </Section>
  );
}
