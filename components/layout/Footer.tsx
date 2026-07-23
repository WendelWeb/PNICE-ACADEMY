import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LangToggle } from '@/components/LangToggle';
import { Sceau } from '@/components/ui/Sceau';

const PAYMENTS = ['MonCash', 'NatCash', 'Visa', 'PayPal'];

export async function Footer() {
  const t = await getTranslations('footer');
  const tLegal = await getTranslations('admin.settings.legal.page');

  const legalLinks: Array<{ slug: 'cgu' | 'confidentialite' | 'remboursement' }> = [
    { slug: 'cgu' },
    { slug: 'confidentialite' },
    { slug: 'remboursement' },
  ];

  return (
    <footer className="relative z-10 mt-8 border-t border-ink/10 bg-ink text-paper-light">
      <div className="mx-auto max-w-page px-6 py-14 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          {/* brand */}
          <div className="sm:col-span-2 lg:col-span-1">
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

          {/* Aprann */}
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.learn.title')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/formations" className="text-paper-light/85 hover:text-ochre">
                  {t('columns.learn.formations')}
                </Link>
              </li>
              <li>
                <Link href="/#pri" className="text-paper-light/85 hover:text-ochre">
                  {t('columns.learn.pricing')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Anseye — teaser, not live yet */}
          <div>
            <h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.teach.title')}
              <span className="rounded-full border border-ochre/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold normal-case tracking-normal text-ochre">
                {t('columns.teach.badge')}
              </span>
            </h3>
            <Link
              href="/#anseye"
              className="mt-4 inline-block text-sm leading-relaxed text-paper-light/70 transition-colors hover:text-ochre"
            >
              {t('columns.teach.teaser')}
            </Link>
          </div>

          {/* Èd */}
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.help.title')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/kont" className="text-paper-light/85 hover:text-ochre">
                  {t('columns.help.account')}
                </Link>
              </li>
              <li>
                <Link href="/kont?tab=support" className="text-paper-light/85 hover:text-ochre">
                  {t('columns.help.support')}
                </Link>
              </li>
              <li>
                <Link href="/certificats/verifier" className="text-paper-light/85 hover:text-ochre">
                  {t('columns.help.verify')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.legal.title')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {legalLinks.map(({ slug }) => (
                <li key={slug}>
                  <Link href={`/legal/${slug}`} className="text-paper-light/85 hover:text-ochre">
                    {tLegal(slug)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-paper-light/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('payments')}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
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
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="max-w-xs font-mono text-[11px] leading-relaxed text-paper-light/45 sm:text-right">
              {t('localeNote')}
            </p>
            <LangToggle tone="dark" variant="full" />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-paper-light/10 pt-6 font-mono text-[11px] text-paper-light/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} PNICE Academy — {t('rights')}.</span>
          <span>
            {t('contact')} · {t('contactEmail')}
          </span>
        </div>
      </div>
    </footer>
  );
}
