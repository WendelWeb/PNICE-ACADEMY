import { getTranslations } from 'next-intl/server';
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconBrandYoutube,
  IconMail,
} from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { LangToggle } from '@/components/LangToggle';
import { Sceau } from '@/components/ui/Sceau';
import { activeProviderLabels } from '@/lib/payments/providers';
import { whatsAppHref, safeSocialUrl } from '@/lib/site/links';
import { teachers } from '@/data/teachers';

/**
 * The footer rebuilt as real link groups (Stage: the living manifest):
 * Aprann / Anseye / Èd / Legal, a mailto: contact that actually opens a
 * mail client, an optional WhatsApp line (NEXT_PUBLIC_WHATSAPP_NUMBER —
 * hidden when unset), optional social icons (NEXT_PUBLIC_SOCIAL_* — each
 * hidden when unset), payment badges from the ONE payment-truth source,
 * and the locale switch. All env links are validated (lib/site/links.ts)
 * so a typo degrades to "no link", never a broken one.
 */
export async function Footer() {
  const t = await getTranslations('footer');
  const tLegal = await getTranslations('admin.settings.legal.page');
  // ONE payment-truth source (lib/payments/providers.ts): admin toggles ∩
  // implemented rails — the footer never claims a rail we can't charge.
  const payments = await activeProviderLabels();

  const contactEmail = t('contactEmail');
  const whatsapp = whatsAppHref(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
  const socials = [
    { key: 'Facebook', href: safeSocialUrl(process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK), Icon: IconBrandFacebook },
    { key: 'Instagram', href: safeSocialUrl(process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM), Icon: IconBrandInstagram },
    { key: 'YouTube', href: safeSocialUrl(process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE), Icon: IconBrandYoutube },
    { key: 'TikTok', href: safeSocialUrl(process.env.NEXT_PUBLIC_SOCIAL_TIKTOK), Icon: IconBrandTiktok },
  ].filter((s): s is { key: string; href: string; Icon: typeof IconBrandFacebook } =>
    Boolean(s.href),
  );

  const legalLinks: Array<{ slug: 'cgu' | 'confidentialite' | 'remboursement' }> = [
    { slug: 'cgu' },
    { slug: 'confidentialite' },
    { slug: 'remboursement' },
  ];

  const linkCls = 'text-paper-light/85 transition-colors hover:text-ochre';

  return (
    <footer className="relative z-10 mt-8 border-t border-ink/10 bg-ink text-paper-light">
      <div className="mx-auto max-w-page px-6 py-14 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          {/* brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <Sceau size="xs" tone="ochre" rotate={-6}>
                PA
              </Sceau>
              <span className="font-display text-xl font-extrabold lowercase tracking-tight">
                pnice academy
              </span>
            </div>
            <p className="mt-4 max-w-xs font-display text-2xl font-bold leading-tight">
              {t('tagline')}
            </p>
            <p className="mt-3 text-sm text-paper-light/60">{t('madeFor')}</p>
            <p className="mt-2">
              <Link
                href="/apropos"
                className="text-sm text-paper-light/60 underline decoration-paper-light/25 underline-offset-2 transition-colors hover:text-ochre"
              >
                {t('aboutLink')}
              </Link>
            </p>
            {socials.length > 0 && (
              <ul className="mt-5 flex items-center gap-3">
                {socials.map(({ key, href, Icon }) => (
                  <li key={key}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={key}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-paper-light/15 text-paper-light/70 transition-colors hover:border-ochre hover:text-ochre focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
                    >
                      <Icon size={18} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Aprann */}
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.learn.title')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/formations" className={linkCls}>
                  {t('columns.learn.formations')}
                </Link>
              </li>
              <li>
                <Link href="/pri" className={linkCls}>
                  {t('columns.learn.pricing')}
                </Link>
              </li>
              <li>
                <Link href="/tableau-de-bord" className={linkCls}>
                  {t('columns.learn.dashboard')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Anseye */}
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.teach.title')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/enseigner" className={linkCls}>
                  {t('columns.teach.become')}
                </Link>
              </li>
              <li>
                <Link href="/prof" className={linkCls}>
                  {t('columns.teach.directory')}
                </Link>
              </li>
              <li>
                <Link href={`/prof/${teachers[0].slug}`} className={linkCls}>
                  {t('columns.teach.example')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Èd — real contact channels, no auth wall */}
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.help.title')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/fak" className={linkCls}>
                  {t('columns.help.faq')}
                </Link>
              </li>
              <li>
                <Link href="/kontak" className={linkCls}>
                  {t('columns.help.contactPage')}
                </Link>
              </li>
              <li>
                <Link href="/kont" className={linkCls}>
                  {t('columns.help.account')}
                </Link>
              </li>
              <li>
                <Link href="/certificats/verifier" className={linkCls}>
                  {t('columns.help.verify')}
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${contactEmail}`}
                  className={`${linkCls} inline-flex items-center gap-1.5`}
                >
                  <IconMail size={15} className="shrink-0" />
                  {t('columns.help.email')}
                </a>
              </li>
              {whatsapp && (
                <li>
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${linkCls} inline-flex items-center gap-1.5`}
                  >
                    <IconBrandWhatsapp size={15} className="shrink-0" />
                    {t('columns.help.whatsapp')}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('columns.legal.title')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {legalLinks.map(({ slug }) => (
                <li key={slug}>
                  <Link href={`/legal/${slug}`} className={linkCls}>
                    {tLegal(slug)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-paper-light/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-mono text-xs uppercase tracking-[0.16em] text-paper-light/50">
              {t('payments')}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {payments.map((p) => (
                <li
                  key={p}
                  className="rounded border border-paper-light/15 px-2.5 py-1 font-mono text-[11px] text-paper-light/80"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="max-w-xs font-mono text-[11px] leading-relaxed text-paper-light/45 sm:text-right">
              {t('localeNote')}
            </p>
            <LangToggle tone="dark" variant="full" />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-paper-light/10 pt-6 font-mono text-[11px] text-paper-light/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} PNICE Academy — {t('rights')}.</span>
          <a href={`mailto:${contactEmail}`} className="transition-colors hover:text-ochre">
            {t('contact')} · {contactEmail}
          </a>
        </div>
      </div>
    </footer>
  );
}
