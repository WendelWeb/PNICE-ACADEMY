import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { activeProviderLabels } from '@/lib/payments/providers';

/**
 * The final CTA (Stage: the living manifest, section 10) — « Kòmanse
 * vwayaj ou » into the catalogue (/formations, never a bare pay screen).
 * The payment chips come from `activeProviders()` — the ONE payment-truth
 * source — so this band can never again advertise a rail nobody can charge
 * through.
 */
export async function FinalCta() {
  const t = await getTranslations('home.finalCta');
  const payments = await activeProviderLabels();

  return (
    <section className="relative overflow-hidden bg-ink py-20 text-center text-paper-light">
      <Container>
        <Reveal>
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-black leading-tight md:text-5xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-paper-light/75">{t('subtitle')}</p>
          <Link href="/formations" className={buttonClasses('primary', 'lg', 'mt-8')}>
            {t('cta')}
          </Link>
          {payments.length > 0 && (
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-2">
              {payments.map((p) => (
                <li
                  key={p}
                  className="rounded border border-paper-light/15 px-2.5 py-1 font-mono text-[11px] text-paper-light/70"
                >
                  {p}
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </Container>
    </section>
  );
}
