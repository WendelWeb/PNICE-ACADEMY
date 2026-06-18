import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LangToggle } from '@/components/LangToggle';
import { buttonClasses } from '@/components/ui/Button';

export async function Nav() {
  const t = await getTranslations('nav');

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper-light/85 backdrop-blur supports-[backdrop-filter]:bg-paper-light/70">
      <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-6 py-3.5 md:px-8">
        <Link
          href="/"
          className="font-display text-lg font-extrabold lowercase leading-none tracking-tight text-ink"
        >
          pnice academy
        </Link>

        <nav className="flex items-center gap-4 md:gap-6">
          <Link
            href="/formations"
            className="hidden text-sm text-ink/75 transition-colors hover:text-ink sm:inline"
          >
            {t('formations')}
          </Link>
          <Link
            href="/#pri"
            className="hidden text-sm text-ink/75 transition-colors hover:text-ink sm:inline"
          >
            {t('pricing')}
          </Link>
          <LangToggle />
          <Link
            href="/checkout"
            className={buttonClasses('primary', 'md', 'hidden sm:inline-flex')}
          >
            {t('cta')}
          </Link>
        </nav>
      </div>
    </header>
  );
}
