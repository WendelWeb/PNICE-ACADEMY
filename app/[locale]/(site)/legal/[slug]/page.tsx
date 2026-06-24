import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { getLegal } from '@/lib/admin/site/ops';
import type { LegalSlug } from '@/lib/admin/site/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'PNICE Academy' };

const SLUGS: LegalSlug[] = ['cgu', 'confidentialite', 'remboursement'];

export default async function LegalPage({
  params: { locale, slug },
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
}) {
  setRequestLocale(locale);
  if (!SLUGS.includes(slug as LegalSlug)) notFound();
  const t = await getTranslations('admin.settings.legal');
  const page = getLegal(slug as LegalSlug);
  const content = page ? (locale === 'ht' ? page.versions[0].content_ht : page.versions[0].content_fr) : '';

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-ink">{t(`page.${slug}`)}</h1>
        {content.trim() ? (
          <div className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-graphite/85">{content}</div>
        ) : (
          <p className="mt-6 font-mono text-sm text-graphite/55">{t('emptyPublic')}</p>
        )}
      </Container>
    </Section>
  );
}
