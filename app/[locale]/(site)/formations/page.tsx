import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { ManifestList } from '@/components/courses/ManifestList';
import { courses } from '@/data/courses';

export const metadata: Metadata = {
  title: 'Fòmasyon — PNICE Academy',
};

export default async function FormationsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('catalog');

  return (
    <Section>
      <Container>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>{t('eyebrow')}</Eyebrow>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
              {t('title')}
            </h1>
            <p className="mt-3 max-w-xl text-graphite">{t('subtitle')}</p>
          </div>
          <Sceau size="md" print rotate={-6} className="shrink-0">
            <span className="font-display text-3xl font-black leading-none">9</span>
            <span className="mt-0.5 text-[9px] tracking-[0.18em]">manifès</span>
          </Sceau>
        </div>

        <div className="mt-12">
          <ManifestList courses={courses} />
        </div>
      </Container>
    </Section>
  );
}
