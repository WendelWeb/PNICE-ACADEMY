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
  // DB content if non-empty (per language), else the complete code-shipped
  // default from data/legal.ts — a payments site never shows an empty policy.
  const page = await getLegal(slug as LegalSlug);
  const version = page?.versions[0];
  const content = version ? (locale === 'ht' ? version.content_ht : version.content_fr) : '';
  const hasContent = content.trim().length > 0;
  const updatedLabel =
    hasContent && version
      ? new Date(version.updatedAt).toLocaleDateString(locale === 'ht' ? 'fr' : locale, {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : null;

  return (
    <Section>
      <Container className="max-w-prose">
        {/* mono document header — the same "official paper" vernacular as
            the certificate and receipt pages (PART A1), toned down for a
            purely textual legal document. */}
        <header className="border-b border-ink/10 pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink/45">{t('title')}</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight text-ink md:text-4xl">
            {t(`page.${slug}`)}
          </h1>
          {updatedLabel && (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-ink/40">
              {t('lastUpdated')} · {updatedLabel}
            </p>
          )}
        </header>

        {hasContent ? (
          <div className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed text-graphite/85">
            {content}
          </div>
        ) : (
          <p className="mt-8 font-mono text-sm text-graphite/55">{t('emptyPublic')}</p>
        )}
      </Container>
    </Section>
  );
}
