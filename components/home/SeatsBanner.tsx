import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { SEATS_LEFT_PLACEHOLDER } from '@/data/testimonials';

export async function SeatsBanner() {
  const t = await getTranslations('home.seats');
  const tHero = await getTranslations('home.hero');

  return (
    <section className="bg-ink text-paper-light">
      <Container className="flex flex-col items-center gap-6 py-10 text-center md:flex-row md:justify-between md:text-left">
        <div className="flex items-center gap-4">
          <span className="font-display text-5xl font-black leading-none text-ochre">
            {SEATS_LEFT_PLACEHOLDER}
          </span>
          <div>
            <p className="font-display text-xl font-bold">{t('text')}</p>
            <p className="font-mono text-xs text-paper-light/55">
              {SEATS_LEFT_PLACEHOLDER} {t('left')} · {t('note')}
            </p>
          </div>
        </div>
        <AuthCta
          href="/checkout"
          className={buttonClasses('primary', 'lg', 'shrink-0')}
        >
          {tHero('ctaPrimary')}
        </AuthCta>
      </Container>
    </section>
  );
}
