'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { IconSearch } from '@tabler/icons-react';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-2 focus-visible:ring-offset-paper-light';

/**
 * The hero's inline course search (Stage: the living manifest) — the same
 * flow the old MarketplaceBar owned: submit always lands on /formations,
 * with `?q=` when the visitor typed something, bare (browse everything)
 * otherwise. Client component only for the router; the two hero CTAs above
 * it stay plain server-rendered links.
 */
export function HeroSearch() {
  const t = useTranslations('home.hero.search');
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? { pathname: '/formations', query: { q } } : '/formations');
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="flex max-w-lg items-center gap-2">
      <div className="relative flex-1">
        <IconSearch
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('label')}
          className={cn(
            'w-full rounded-full border border-ink/15 bg-paper py-2.5 pl-10 pr-4 text-sm text-ink shadow-sm outline-none transition-colors motion-reduce:transition-none',
            focusRing,
          )}
        />
      </div>
      <button
        type="submit"
        className={cn(
          'shrink-0 rounded-full bg-ink px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide text-paper-light transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/25 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          focusRing,
        )}
      >
        {t('cta')}
      </button>
    </form>
  );
}
