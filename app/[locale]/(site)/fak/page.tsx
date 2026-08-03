import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconArrowRight, IconLink } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';

/**
 * The page's structure lives in CODE (stable anchor ids + optional related
 * links), the words live in messages/{ht,fr}.json under `fak.*` — so anchors
 * never change when copy is edited, and the i18n parity check still covers
 * every string. Each item id doubles as its URL anchor (#kat, #ranbousman…),
 * making every answer individually linkable from support replies, WhatsApp,
 * or other pages.
 */
const FAK_SECTIONS: {
  id: string;
  items: { id: string; href?: string }[];
}[] = [
  {
    id: 'aprann',
    items: [
      { id: 'kijan-li-mache' },
      { id: 'lang' },
      { id: 'telefon' },
      { id: 'pwograme' },
    ],
  },
  {
    id: 'peye',
    items: [
      { id: 'kat' },
      { id: 'moncash' },
      { id: 'sel-pri' },
      { id: 'pass-diferans', href: '/pri' },
      { id: 'kanpe-abonman' },
      { id: 'ranbousman', href: '/legal/remboursement' },
    ],
  },
  {
    id: 'anseye',
    items: [
      { id: 'vin-anseyan', href: '/enseigner' },
      { id: 'kont-anseyan' },
      { id: 'pri-ou' },
      { id: 'kalite' },
    ],
  },
  {
    id: 'retre',
    items: [{ id: 'kijan-touche' }, { id: 'metod-retre' }, { id: 'minimum' }],
  },
  {
    id: 'setifika',
    items: [
      { id: 'jwenn-setifika' },
      { id: 'verifye-setifika', href: '/certificats/verifier' },
    ],
  },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'fak' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * `/fak` — the standalone, indexable help page (Stage 4): the home and
 * /enseigner FAQs aggregated and extended into five sections (Aprann · Peye ·
 * Anseye · Retrè · Sètifika). Every entry is server-rendered OPEN (no
 * accordion) so search engines and Ctrl+F see everything, and every entry
 * heading is its own #anchor link. The footer's « Èd » group lands here.
 */
export default async function FakPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('fak');
  const tc = await getTranslations('common');

  return (
    <Section>
      <Container className="max-w-3xl">
        <header>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-xl leading-relaxed text-graphite">{t('intro')}</p>

          {/* section jump links */}
          <nav aria-label={t('tocLabel')} className="mt-6 flex flex-wrap gap-2">
            {FAK_SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-ink/20 px-3.5 py-1.5 font-mono text-xs uppercase tracking-wide text-ink/65 transition-colors hover:border-ochre hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
              >
                {t(`sections.${s.id}.title`)}
              </a>
            ))}
          </nav>
        </header>

        {FAK_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="mt-12 scroll-mt-24"
          >
            <Reveal>
              <h2 className="border-b-2 border-ink/80 pb-2 font-display text-2xl font-extrabold text-ink">
                {t(`sections.${section.id}.title`)}
              </h2>
            </Reveal>
            <dl>
              {section.items.map((item) => (
                <Reveal key={item.id}>
                  <div
                    id={item.id}
                    className="scroll-mt-24 border-b border-ink/10 py-5 last:border-b-0"
                  >
                    <dt>
                      <a
                        href={`#${item.id}`}
                        className="group inline-flex items-start gap-2 font-display text-lg font-bold text-ink transition-colors hover:text-ochre"
                      >
                        {t(`items.${item.id}.q`)}
                        <IconLink
                          size={14}
                          aria-hidden="true"
                          className="mt-1.5 shrink-0 text-ink/25 transition-colors group-hover:text-ochre"
                        />
                      </a>
                    </dt>
                    <dd className="mt-2 text-[15px] leading-relaxed text-graphite/85">
                      {t(`items.${item.id}.a`)}
                      {item.href && (
                        <Link
                          href={item.href}
                          className="mt-2 flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-teal transition-colors hover:text-ochre"
                        >
                          {t(`items.${item.id}.linkLabel`)}
                          <IconArrowRight size={13} />
                        </Link>
                      )}
                    </dd>
                  </div>
                </Reveal>
              ))}
            </dl>
          </section>
        ))}

        {/* still stuck → contact */}
        <div className="mt-14 rounded-2xl border border-ink/15 bg-paper p-7 text-center">
          <p className="font-display text-xl font-bold text-ink">{t('contactTitle')}</p>
          <p className="mt-2 text-sm leading-relaxed text-graphite/80">{t('contactBody')}</p>
          <p className="mt-5">
            <Link href="/kontak" className={buttonClasses('primary', 'md')}>
              {t('contactCta')}
              <IconArrowRight size={15} />
            </Link>
          </p>
          <p className="mt-3 font-mono text-[11px] text-ink/45">
            {tc('or')} · <Link href="/formations" className="underline underline-offset-2 transition-colors hover:text-ochre">{t('browseLink')}</Link>
          </p>
        </div>
      </Container>
    </Section>
  );
}
