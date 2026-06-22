import { getTranslations } from 'next-intl/server';
import { IconShieldLock } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';

/**
 * Hard gate shown when an admin account hasn't enabled 2FA. Admin access is
 * blocked until 2FA is on — the button sends them to the existing /kont
 * security page where the 2FA flow lives (Phase 1 Lot 2).
 */
export async function Require2FA() {
  const t = await getTranslations('admin.require2fa');

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-7 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ochre/15">
          <IconShieldLock size={28} className="text-ochre" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-graphite/80">{t('body')}</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Link href="/kont" className={buttonClasses('primary', 'lg', 'w-full')}>
            {t('cta')}
          </Link>
          <Link
            href="/"
            className="font-mono text-xs text-ink/55 underline-offset-2 hover:text-ink hover:underline"
          >
            {t('back')}
          </Link>
        </div>
      </div>
    </div>
  );
}
