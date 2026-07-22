import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { buttonClasses } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Mèsi — PNICE Academy' };

export default async function MerciPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('merci');
  return (
    <Section>
      <Container className="max-w-2xl text-center">
        <h1 className="font-display text-4xl font-black text-ink md:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-graphite/80">{t('body')}</p>
        <Link
          href={`/${locale}/tableau-de-bord`}
          className={buttonClasses('primary', 'lg', 'mt-8 inline-flex')}
        >
          {t('cta')}
        </Link>
      </Container>
    </Section>
  );
}
