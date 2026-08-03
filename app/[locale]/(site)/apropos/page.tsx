import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container } from '@/components/ui/Section';
import { teachers } from '@/data/teachers';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'apropos' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * `/apropos` — the mission page (Stage 4), document-styled like the legal
 * pages (same mono header + max-w-prose body): the founder story (the same
 * true shipping-origin story the home page tells), what PNICE Academy is (a
 * marketplace by and for Haitians), how moderation works (every teacher and
 * every course is reviewed before publication), and the money facts (70/30
 * split, secure card payments) — stated plainly, no marketing invention.
 */
export default async function AproposPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('apropos');

  const sectionKeys = ['story', 'marketplace', 'moderation', 'money'] as const;
  const moneyFacts = t.raw('sections.money.facts') as string[];

  return (
    <Section>
      <Container className="max-w-prose">
        {/* mono document header — the same "official paper" vernacular as
            the legal and certificate pages. */}
        <header className="border-b border-ink/10 pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink/45">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight text-ink md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-graphite/85">{t('intro')}</p>
        </header>

        {sectionKeys.map((key) => {
          const paragraphs = t.raw(`sections.${key}.p`) as string[];
          return (
            <section key={key} className="mt-10">
              <h2 className="font-display text-xl font-bold text-ink md:text-2xl">
                {t(`sections.${key}.title`)}
              </h2>
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-graphite/85"
                >
                  {p}
                </p>
              ))}
              {key === 'money' && (
                <ul className="mt-5 grid grid-cols-1 border-y border-ink/10 font-mono text-xs tracking-[0.04em] text-ink/75 sm:grid-cols-3 sm:divide-x sm:divide-ink/10">
                  {moneyFacts.map((fact) => (
                    <li key={fact} className="px-2 py-3 text-center md:py-4">
                      {fact}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {/* where to go next — the page's honest calls to action */}
        <nav className="mt-12 border-t border-ink/10 pt-6">
          <ul className="space-y-2.5">
            {(
              [
                { href: '/formations', label: t('links.catalog') },
                { href: `/prof/${teachers[0].slug}`, label: t('links.teacherOne') },
                { href: '/enseigner', label: t('links.teach') },
                { href: '/pri', label: t('links.pricing') },
              ] as const
            ).map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-teal transition-colors hover:text-ochre"
                >
                  {label}
                  <IconArrowRight
                    size={13}
                    className="transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </Section>
  );
}
