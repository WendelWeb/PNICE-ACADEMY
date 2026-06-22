import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';

const PAYMENTS = ['PayPal', 'Visa / Mastercard', 'MonCash', 'NatCash', 'Crypto'];

export async function FinalCta() {
  const t = await getTranslations('home.finalCta');

  return (
    <section className="relative overflow-hidden bg-ink py-20 text-center text-paper-light">
      <Container>
        <h2 className="mx-auto max-w-2xl font-display text-4xl font-black leading-tight md:text-5xl">
          {t('title')}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-paper-light/75">
          {t('subtitle')}
        </p>
        <AuthCta href="/checkout" className={buttonClasses('primary', 'lg', 'mt-8')}>
          {t('cta')}
        </AuthCta>
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {PAYMENTS.map((p) => (
            <li
              key={p}
              className="rounded border border-paper-light/15 px-2.5 py-1 font-mono text-[11px] text-paper-light/70"
            >
              {p}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
