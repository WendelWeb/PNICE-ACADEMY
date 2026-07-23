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
        <div className="text-center">
          <Sceau size="sm" tone="ink" rotate={-6} className="mx-auto">
            PA
          </Sceau>
          <h1 className="mt-5 font-display text-3xl font-bold text-ink">{t('form.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-graphite/70">{t('form.help')}</p>
        </div>
        <VerifyForm placeholder={t('form.placeholder')} submitLabel={t('form.submit')} />
      </Container>
    </Section>
  );
}
