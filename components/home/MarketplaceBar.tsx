'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { IconSearch } from '@tabler/icons-react';
import { Link, useRouter } from '@/i18n/routing';
import { Container } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';
import { COURSE_CATEGORIES, courses, type CourseCategory } from '@/data/courses';
import { categoryIcon } from '@/lib/courseCategory';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-2 focus-visible:ring-offset-paper-light';

/** Live count per category, derived from the catalog — never hardcoded. */
function categoryCounts(): Record<CourseCategory, number> {
  const counts = {} as Record<CourseCategory, number>;
  for (const cat of COURSE_CATEGORIES) {
    counts[cat] = courses.filter((c) => c.category === cat).length;
  }
  return counts;
}

/**
 * The marketplace's front door (M1 target flow #2): a prominent search
 * field + 4 category tiles, right under the hero. Client component (search
 * submit needs the router; category tiles are plain links so they still
 * work with JS disabled). Search always lands on /formations — with `?q=`
 * when the visitor typed something, or bare (browse everything) otherwise.
 */
export function MarketplaceBar() {
  const t = useTranslations('home.marketplace');
  const tCat = useTranslations('catalog');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const counts = categoryCounts();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? { pathname: '/formations', query: { q } } : '/formations');
  }

  return (
    <section className="border-y border-ink/10 bg-paper-light/70">
      <Container className="py-10 md:py-14">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-teal">
              {t('eyebrow')}
            </span>
            <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight text-ink md:text-3xl">
              {t('title')}
            </h2>
          </div>

          <form
            onSubmit={handleSubmit}
            role="search"
            className="mx-auto mt-7 flex max-w-xl items-center gap-2.5"
          >
            <div className="relative flex-1">
              <IconSearch
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/40"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchLabel')}
                className={cn(
                  'w-full rounded-full border border-ink/15 bg-paper py-3.5 pl-11 pr-4 text-sm text-ink shadow-sm outline-none transition-colors motion-reduce:transition-none',
                  focusRing,
                )}
              />
            </div>
            <button
              type="submit"
              className={cn(
                'shrink-0 rounded-full bg-ochre px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-wide text-[#1b1207] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ochre/30 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                focusRing,
              )}
            >
              {t('searchCta')}
            </button>
          </form>

          <p className="mt-10 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink/45">
            {t('categoriesLabel')}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COURSE_CATEGORIES.map((cat) => {
              const Icon = categoryIcon[cat];
              return (
                <Link
                  key={cat}
                  href={{ pathname: '/formations', query: { cat } }}
                  className={cn(
                    'card-hover group flex flex-col items-start gap-2 rounded-xl border border-ink/12 bg-paper-light p-4 outline-none transition-colors hover:border-ochre/40',
                    focusRing,
                  )}
                >
                  <Icon
                    size={22}
                    stroke={1.6}
                    className="text-teal transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:text-ochre motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
                  />
                  <span className="font-display text-base font-bold text-ink">
                    {tCat(`categories.${cat}`)}
                  </span>
                  <span className="font-mono text-[11px] text-ink/50">
                    {t('categoryCount', { count: counts[cat] })}
                  </span>
                </Link>
              );
            })}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
