'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export function LangToggle({
  className,
  tone = 'light',
  variant = 'short',
}: {
  className?: string;
  /** `light` (default) is for use on paper/ink-on-light surfaces, e.g. the
   *  nav. `dark` flips the inactive/separator colors for ink-background
   *  surfaces, e.g. the footer. */
  tone?: 'light' | 'dark';
  /** `short` (default) renders the compact "kr" / "fr" labels used in the
   *  nav. `full` spells out the language names — used where there's room,
   *  e.g. the footer. */
  variant?: 'short' | 'full';
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function setLocale(next: 'ht' | 'fr') {
    if (next !== locale) {
      router.replace(pathname, { locale: next });
    }
  }

  const base =
    'rounded px-1.5 py-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre';
  const inactive =
    tone === 'dark' ? 'text-paper-light/55 hover:text-paper-light' : 'text-ink/55 hover:text-ink';
  const separator = tone === 'dark' ? 'text-paper-light/25' : 'text-ink/25';
  const labels = variant === 'full' ? { ht: 'Kreyòl', fr: 'Français' } : { ht: 'kr', fr: 'fr' };

  return (
    <div
      className={cn('flex items-center gap-1 font-mono text-xs', className)}
      role="group"
      aria-label="Lang / Langue"
    >
      <button
        type="button"
        onClick={() => setLocale('ht')}
        aria-pressed={locale === 'ht'}
        className={cn(base, locale === 'ht' ? 'font-semibold text-ochre' : inactive)}
      >
        {labels.ht}
      </button>
      <span className={separator}>·</span>
      <button
        type="button"
        onClick={() => setLocale('fr')}
        aria-pressed={locale === 'fr'}
        className={cn(base, locale === 'fr' ? 'font-semibold text-ochre' : inactive)}
      >
        {labels.fr}
      </button>
    </div>
  );
}
