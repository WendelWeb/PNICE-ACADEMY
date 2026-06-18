'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export function LangToggle({ className }: { className?: string }) {
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
        className={cn(
          base,
          locale === 'ht' ? 'font-semibold text-ochre' : 'text-ink/55 hover:text-ink',
        )}
      >
        kr
      </button>
      <span className="text-ink/25">·</span>
      <button
        type="button"
        onClick={() => setLocale('fr')}
        aria-pressed={locale === 'fr'}
        className={cn(
          base,
          locale === 'fr' ? 'font-semibold text-ochre' : 'text-ink/55 hover:text-ink',
        )}
      >
        fr
      </button>
    </div>
  );
}
