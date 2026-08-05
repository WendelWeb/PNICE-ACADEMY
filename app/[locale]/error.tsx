'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { IconRefresh, IconHome } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Sceau } from '@/components/ui/Sceau';
import { buttonClasses } from '@/components/ui/Button';

/**
 * Locale-wide error boundary (Stage 8 — launch hygiene). MUST be a Client
 * Component (Next's contract for error.tsx) — which means it can't render
 * the async Server Components Nav/Footer directly (see not-found.tsx's
 * doc comment for the boundary this file sits at). Chrome here is
 * deliberately minimal instead: a brand mark linking home plus the two
 * escape hatches (retry the failed render, or leave for the homepage) —
 * still on-brand, still bilingual via next-intl's CLIENT `useTranslations`
 * hook (the server `getTranslations` the rest of the app uses isn't
 * callable here).
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorPage');

  useEffect(() => {
    console.error('[locale-error-boundary]', error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 py-16 text-center">
      <div className="max-w-md">
        <Link href="/" className="mx-auto mb-8 inline-flex items-center gap-2.5">
          <Sceau size="xs" tone="ink" rotate={-6}>
            PA
          </Sceau>
          <span className="font-display text-lg font-extrabold lowercase tracking-tight text-ink">
            pnice academy
          </span>
        </Link>
        <Sceau size="lg" tone="red" rotate={4} className="mx-auto">
          <IconRefresh size={30} />
        </Sceau>
        <span className="mt-7 block font-mono text-xs uppercase tracking-[0.18em] text-teal">
          {t('eyebrow')}
        </span>
        <h1 className="mt-3 font-display text-3xl font-black leading-tight text-ink md:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-3 leading-relaxed text-graphite">{t('body')}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className={buttonClasses('primary', 'lg')}>
            <IconRefresh size={18} />
            {t('retry')}
          </button>
          <Link href="/" className={buttonClasses('ghost', 'lg')}>
            <IconHome size={18} />
            {t('home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
