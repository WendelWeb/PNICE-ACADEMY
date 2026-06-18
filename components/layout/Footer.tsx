import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Sceau } from '@/components/ui/Sceau';

const PAYMENTS = ['PayPal', 'Visa / Mastercard', 'MonCash', 'NatCash', 'Crypto'];

export async function Footer() {
  const t = await getTranslations('footer');

  return (
    <footer className="relative z-10 mt-8 border-t border-ink/10 bg-ink text-paper-light">
      <div className="mx-auto max-w-page px-6 py-14 md:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <Sceau size="xs" tone="ochre" rotate={-6}>
                PA
              </Sceau>
              <span className="font-display text-xl font-extrabold lowercase tracking-tight">
                pnice academy
              </span>
            </div>
            <p className="mt-4 max-w-xs font-display text-2xl font-bold leading-tight">
              {t('tagline')}
            </p>
            <p className="mt-3 text-sm text-paper-light/60">{t('madeFor')}</p>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('explore')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/formations" className="text-paper-light/85 hover:text-ochre">
                  {t('links.formations')}
                </Link>
              </li>
              <li>
                <Link href="/#pri" className="text-paper-light/85 hover:text-ochre">
                  {t('links.pricing')}
                </Link>
              </li>
              <li>
                <Link href="/sign-in" className="text-paper-light/85 hover:text-ochre">
                  {t('links.login')}
                </Link>
              </li>
              <li>
                <Link href="/kont" className="text-paper-light/85 hover:text-ochre">
                  {t('links.myAccount')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('payments')}
            </h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {PAYMENTS.map((p) => (
                <li
                  key={p}
                  className="rounded border border-paper-light/15 px-2.5 py-1 font-mono text-[11px] text-paper-light/80"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-paper-light/10 pt-6 font-mono text-[11px] text-paper-light/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} PNICE Academy — {t('rights')}.</span>
          <span>PNICE Shipping · Miami ⇄ Ayiti</span>
        </div>
      </div>
    </footer>
  );
}
