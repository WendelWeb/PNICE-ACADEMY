'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconSearch } from '@tabler/icons-react';
import { Link, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { SmartImage } from '@/components/ui/SmartImage';
import { Price } from '@/components/ui/Price';
import { courseTitle } from '@/lib/courseFields';
import { tokenizeQuery, courseSearchScore } from '@/lib/courses/search';
import type { NavIndexEntry } from '@/lib/courses/nav-index';

const MAX_SUGGESTIONS = 6;

/**
 * The global nav search — thumbnail + title + price suggestions as you type,
 * on EVERY page (the Udemy header gesture). Suggestions are scored by the
 * same relevance brain as /formations (lib/courses/search.ts) over the
 * layout-embedded index — zero network per keystroke.
 *
 * Two variants of ONE component: `desktop` (sm+, dropdown overlay) and
 * `mobile` (inside the burger panel, inline results). Combobox semantics:
 * arrows move (aria-activedescendant tracks for screen readers), Enter opens
 * the active course (or the full results page when nothing is active),
 * Escape closes, focus leaving the widget closes it.
 *
 * Browser trap (adversarial review): Safari/iOS and Firefox do NOT focus a
 * tapped link/button, so the input's blur fires with relatedTarget=null and
 * would unmount the panel BEFORE the tap's click dispatches — the
 * `onMouseDown={preventDefault}` on the panel keeps focus in the input so a
 * tap on a suggestion actually navigates. Do not remove it.
 */
export function NavSearch({ entries, variant }: { entries: NavIndexEntry[]; variant: 'desktop' | 'mobile' }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const tokens = tokenizeQuery(q);
    if (tokens.length === 0) return [];
    return entries
      .map((e) => ({ e, score: courseSearchScore(e.course, tokens, e.teacher ?? undefined) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS);
  }, [entries, q]);

  const showPanel = open && q.trim().length > 0;
  const listId = `nav-search-list-${variant}`;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const goToAll = () => {
    close();
    router.push(`/formations?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setActive((prev) => {
        // Cycle through: -1 (the input itself) → 0..n-1 → back to -1.
        const next = prev + (e.key === 'ArrowDown' ? 1 : -1);
        if (next < -1) return results.length - 1;
        if (next >= results.length) return -1;
        return next;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!q.trim()) return;
      if (showPanel && active >= 0 && results[active]) {
        close();
        router.push(`/formations/${results[active].e.course.slug}`);
      } else {
        goToAll();
      }
    }
  };

  const panel = (
    <>
      {results.length > 0 ? (
        <>
          <ul id={listId} role="listbox" aria-label={t('searchLabel')} className="py-1">
            {results.map(({ e }, i) => (
              <li key={e.course.slug} id={optionId(i)} role="option" aria-selected={i === active}>
                <Link
                  href={`/formations/${e.course.slug}`}
                  tabIndex={-1}
                  onClick={close}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors hover:bg-ink/5',
                    i === active && 'bg-ink/5',
                  )}
                >
                  {e.img && (
                    <span className="relative h-8 w-14 shrink-0 overflow-hidden rounded bg-paper">
                      <SmartImage src={e.img} alt="" fill sizes="56px" className="object-cover" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {courseTitle(e.course, locale)}
                    </span>
                    {e.teacher && (
                      <span className="block truncate text-[11px] text-graphite/60">{e.teacher}</span>
                    )}
                  </span>
                  <Price usd={e.course.priceUsd} className="shrink-0 font-mono text-[12px] font-bold text-ink" />
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            tabIndex={-1}
            onClick={goToAll}
            className="w-full border-t border-ink/10 px-3 py-2.5 text-left font-mono text-[11px] uppercase tracking-wide text-teal transition-colors hover:bg-teal/5"
          >
            {t('searchSeeAll', { query: q.trim() })}
          </button>
        </>
      ) : (
        <p className="px-3 py-3 text-[13px] text-graphite/65">{t('searchNoResults')}</p>
      )}
    </>
  );

  return (
    <div
      ref={boxRef}
      className={cn('relative', variant === 'desktop' && 'hidden sm:block')}
      onBlur={(e) => {
        // Close only when focus truly leaves the widget. (Suggestion taps
        // never blur at all — see the onMouseDown note below.)
        if (!boxRef.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <IconSearch
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={showPanel && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchLabel')}
        className={cn(
          'rounded-full border border-ink/15 bg-paper py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/40 focus-visible:border-ochre focus-visible:ring-1 focus-visible:ring-ochre',
          variant === 'desktop'
            ? 'w-28 transition-[width] focus:w-44 md:w-40 md:focus:w-56 lg:w-56 lg:focus:w-72'
            : 'w-full',
        )}
      />
      {showPanel &&
        (variant === 'desktop' ? (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-ink/15 bg-paper-light shadow-xl"
          >
            {panel}
          </div>
        ) : (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="mt-1 overflow-hidden rounded-xl border border-ink/10 bg-paper"
          >
            {panel}
          </div>
        ))}
    </div>
  );
}
