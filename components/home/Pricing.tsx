import { getLocale, getTranslations } from 'next-intl/server';
import { IconCheck } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import {
  subscription,
  subscriptionPerks_ht,
  subscriptionPerks_fr,
} from '@/data/pricing';
import { courses } from '@/data/courses';
import { Price, PriceSecondary } from '@/components/ui/Price';

export async function Pricing() {
  const t = await getTranslations('home.pricing');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const perks = locale === 'ht' ? subscriptionPerks_ht : subscriptionPerks_fr;

  const prices = courses.map((c) => c.priceUsd);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return (
    <Section id="pri" className="bg-paper">
      <Container>
        <div className="text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-ink md:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-graphite">{t('subtitle')}</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl items-start gap-6 md:grid-cols-2">
          {/* Subscription */}
          <div className="relative rounded-2xl border-2 border-ochre bg-paper-light p-8 shadow-lg shadow-ochre/10">
            <span className="absolute -top-3 left-8 rounded-full bg-ochre px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-[#1b1207]">
              {t('popular')}
            </span>
            <h3 className="font-display text-2xl font-bold text-ink">
              {t('subName')}
            </h3>
            <div className="mt-4 flex items-baseline gap-1.5">
              <Price
                usd={subscription.usd}
                className="font-display text-6xl font-black leading-none text-ink"
              />
              <span className="font-mono text-sm text-graphite/70">
                {tc('perMonth')}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-sm text-graphite/60">
              <PriceSecondary usd={subscription.usd} />
              {tc('perMonth')}
            </p>
            <AuthCta
              href="/checkout?plan=sub"
              className={buttonClasses('primary', 'lg', 'mt-6 w-full')}
            >
              {t('subCta')}
            </AuthCta>
            <ul className="mt-6 space-y-2.5">
              {perks.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-graphite">
                  <IconCheck size={18} className="mt-0.5 shrink-0 text-teal" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* À l'unité */}
          <div className="rounded-2xl border border-ink/15 bg-paper-light p-8">
            <h3 className="font-display text-2xl font-bold text-ink">
              {t('unitName')}
            </h3>
            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs uppercase tracking-wide text-graphite/55">
                {t('priceFrom')}
              </span>
              <Price
                usd={min}
                className="font-display text-5xl font-black leading-none text-ink"
              />
              <span className="font-mono text-sm text-graphite/55">
                – <Price usd={max} />
              </span>
            </div>
            <p className="mt-1.5 font-mono text-sm text-graphite/55">
              <PriceSecondary usd={min} /> – <PriceSecondary usd={max} />
            </p>
            <p className="mt-4 text-sm leading-relaxed text-graphite">
              {t('unitText')}
            </p>
            <Link
              href="/formations"
              className={buttonClasses('ghost', 'lg', 'mt-6 w-full')}
            >
              {t('unitCta')}
            </Link>
            <p className="mt-4 font-mono text-[11px] text-graphite/50">
              {t('unitNote')}
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
