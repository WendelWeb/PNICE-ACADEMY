import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconBrandWhatsapp, IconMail } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { ContactForm } from '@/components/site/ContactForm';
import { whatsAppHref } from '@/lib/site/links';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'kontak' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * `/kontak` — the PUBLIC contact page (Stage 4). Support used to hide
 * behind the signed-in /kont area and a plain-text footer email; this page
 * gives every visitor three working channels, no auth wall:
 *   - a real mailto (the same address the footer prints),
 *   - a WhatsApp button (NEXT_PUBLIC_WHATSAPP_NUMBER — hidden when unset or
 *     malformed, validated by lib/site/links.ts like the footer),
 *   - a small message form filing a real support ticket (rate-limited,
 *     works signed-out — see lib/site-actions-public.ts).
 */
export default async function KontakPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('kontak');
  const tFooter = await getTranslations('footer');
  const contactEmail = tFooter('contactEmail');
  const whatsapp = whatsAppHref(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);

  return (
    <Section>
      <Container className="max-w-3xl">
        <header className="border-b border-ink/10 pb-6">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-xl leading-relaxed text-graphite">{t('subtitle')}</p>
        </header>

        {/* direct channels */}
        <Reveal className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href={`mailto:${contactEmail}`}
              className="group flex items-start gap-4 rounded-2xl border border-ink/12 bg-paper-light p-5 transition-colors hover:border-ochre/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ochre/15 text-ochre">
                <IconMail size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-bold text-ink">
                  {t('emailTitle')}
                </span>
                <span className="mt-0.5 block break-all font-mono text-xs text-ink/60 transition-colors group-hover:text-ochre">
                  {contactEmail}
                </span>
              </span>
            </a>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-4 rounded-2xl border border-ink/12 bg-paper-light p-5 transition-colors hover:border-teal/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal/15 text-teal">
                  <IconBrandWhatsapp size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold text-ink">
                    {t('whatsappTitle')}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-ink/60">
                    {t('whatsappNote')}
                  </span>
                </span>
              </a>
            )}
          </div>
        </Reveal>

        {/* the message form */}
        <Reveal delay={80} className="mt-10">
          <div className="overflow-hidden rounded-2xl border border-ink/12 bg-paper-light">
            <header className="flex items-center gap-2 border-b border-ink/10 bg-ink/[0.03] px-5 py-3 sm:px-6">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-ochre" />
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/70 sm:text-xs">
                {t('formTitle')}
              </h2>
            </header>
            <div className="p-5 sm:p-6">
              <ContactForm />
            </div>
          </div>
        </Reveal>

        {/* signed-in shortcut + FAQ pointer */}
        <Reveal delay={140} className="mt-8">
          <p className="text-center text-sm text-graphite/70">
            {t('faqPrompt')}{' '}
            <Link
              href="/fak"
              className="font-semibold text-teal underline decoration-teal/40 underline-offset-2 transition-colors hover:text-ochre"
            >
              {t('faqLink')}
            </Link>
          </p>
          <p className="mt-4 text-center">
            <Link href="/kont" className={buttonClasses('ghost', 'sm')}>
              {t('accountLink')}
            </Link>
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
