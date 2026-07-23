import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { VerifyForm } from '@/components/certificats/VerifyForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vérifier un certificat — PNICE Academy' };

export default async function VerifyLandingPage({
  params: { locale },
}: {
  params: { locale: 'ht' | 'fr' };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('verify');

  return (
    <Section>
      <Container className="max-w-lg">
        {/* the same document frame as the result page, so the lookup and
            its answer read as one continuous "verification desk" (PART A1). */}
        <div className="rounded-2xl border-2 border-ink/15 bg-paper px-6 pb-9 pt-5 text-center shadow-[0_28px_56px_-28px_rgba(16,32,74,0.35)] sm:px-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
            {t('docHeader')}
          </p>
          <div aria-hidden="true" className="mt-2">
            <div className="border-t-2 border-ink/80" />
            <div className="mt-[3px] border-t border-ink/25" />
          </div>

          <Sceau size="sm" tone="ink" rotate={-6} className="mx-auto mt-7">
            PA
          </Sceau>
          <h1 className="mt-5 font-display text-3xl font-bold text-ink">{t('form.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-graphite/70">{t('form.help')}</p>
          <VerifyForm placeholder={t('form.placeholder')} submitLabel={t('form.submit')} />
        </div>
      </Container>
    </Section>
  );
}
