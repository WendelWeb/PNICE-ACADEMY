import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { getSeatsLeft } from '@/lib/admin/site/ops';

export async function SeatsBanner() {
  const t = await getTranslations('home.seats');
  const tHero = await getTranslations('home.hero');
  const seatsLeft = getSeatsLeft();
  if (seatsLeft === null) return null; // banner disabled in admin

  return (
    <section className="bg-ink text-paper-light">
      <Container className="flex flex-col items-center gap-6 py-10 text-center md:flex-row md:justify-between md:text-left">
        <div className="flex items-center gap-4">
          <span className="font-display text-5xl font-black leading-none text-ochre">
            {seatsLeft}
          </span>
          <div>
            <p className="font-display text-xl font-bold">{t('text')}</p>
            <p className="font-mono text-xs text-paper-light/55">
              {seatsLeft} {t('left')} · {t('note')}
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
