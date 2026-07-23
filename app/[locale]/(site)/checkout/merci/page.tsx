import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconMail } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Mèsi — PNICE Academy' };

export default async function MerciPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('merci');

  // Real, uneventful confirmation date — no fabricated order number since this
  // page receives no session/order id (purely a post-payment landing screen).
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  return (
    <Section>
      <Container className="max-w-lg text-center">
        {/* the stamp reprise — a receipt-style document, the same seal
            gesture as the hero manifest and the teacher page (PART A3/A4) */}
        <div className="mx-auto max-w-sm rounded-2xl border border-ink/15 bg-paper px-7 pb-8 pt-6 shadow-[0_28px_56px_-28px_rgba(16,32,74,0.35)]">
          <header
            aria-hidden="true"
            className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink/45"
          >
            <span>{t('docHeader')}</span>
            <span>{dateLabel}</span>
          </header>
          <div aria-hidden="true">
            <div className="mt-2 border-t-2 border-ink/80" />
            <div className="mt-[3px] border-t border-ink/25" />
          </div>

          <div className="mt-7 flex justify-center">
            <Stamp immediate rotate={-8}>
              <Sceau size="lg" rotate={0} tone="ochre">
                <span className="font-display text-2xl font-black leading-none tracking-wide">
                  ✓ {t('sealWord')}
                </span>
              </Sceau>
            </Stamp>
          </div>

          <h1 className="mt-7 font-display text-3xl font-black leading-tight text-ink md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-graphite/80">
            {t('body')}
          </p>
        </div>

        <div className="mt-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink/45">
            {t('nextSteps')}
          </p>
          <Link
            href="/tableau-de-bord"
            className={buttonClasses('primary', 'lg', 'mt-4 inline-flex')}
          >
            {t('cta')}
          </Link>
          <p className="mt-4 flex items-center justify-center gap-1.5 font-mono text-[11px] text-graphite/55">
            <IconMail size={14} className="shrink-0" />
            {t('emailNote')}
          </p>
        </div>
      </Container>
    </Section>
  );
}
