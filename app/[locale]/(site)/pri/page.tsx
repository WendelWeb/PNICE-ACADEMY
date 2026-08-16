import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconCheck, IconRepeat, IconStack2, IconTag } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { getPublishedCourses } from '@/lib/courses/source';
import { getPlatformPassPriceCents } from '@/lib/platformPrice';
import { isPlatformPassEnabled } from '@/lib/admin/platform/store';
import { pickPlanExample, minCoursePriceUsd } from '@/lib/home/source';
import { getAllPublicTeachers } from '@/lib/teacher/public';
import {
  platformPassPerks_ht,
  platformPassPerks_fr,
  teacherPassPerks,
} from '@/data/pricing';
import { courseTitle } from '@/lib/courseFields';

// Prices are DB-backed (owner-set platform pass, teacher-set plans, real
// course prices) — revalidate periodically, same policy as the sales pages.
export const revalidate = 300;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'pri' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * `/pri` — the pricing explainer (Stage 4). The nav's « Pri » entry finally
 * lands on a real page instead of a home anchor: the three ways to pay side
 * by side with their HONEST scope (wording reused from checkout's own
 * scope notes so the promise here can never drift from the pay page), a
 * worked-example strip with REAL numbers (live platform-pass price, a real
 * teacher plan when one exists, a real course price — never invented ones),
 * a pricing FAQ, and CTAs. Card copy reuses the home triptych's keys — one
 * vocabulary for the three products everywhere.
 */
export default async function PriPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const passEnabled = await isPlatformPassEnabled();
  const [t, tHome, tCheckout, tc, platformPassCents, courses, teachers] =
    await Promise.all([
      getTranslations('pri'),
      getTranslations('home.pricing'),
      getTranslations('checkout'),
      getTranslations('common'),
      getPlatformPassPriceCents(),
      getPublishedCourses(),
      getAllPublicTeachers(locale),
    ]);

  const platformPassUsd = platformPassCents / 100;
  const example = pickPlanExample(teachers);
  const minUsd = minCoursePriceUsd(courses);
  // The REAL course behind the « Depi $X » number — its actual title makes
  // the worked example concrete.
  const exampleCourse =
    minUsd !== null ? courses.find((c) => c.priceUsd === minUsd) ?? null : null;

  const platformPerks = locale === 'ht' ? platformPassPerks_ht : platformPassPerks_fr;
  const teacherPerks = teacherPassPerks(example?.name ?? t('teacher.genericName'), locale);

  const faqItems = t.raw('faq') as { q: string; a: string }[];

  const cardBase = 'flex h-full flex-col rounded-2xl border p-7 md:p-8';
  const perkRow = 'flex gap-2.5 text-sm text-graphite';

  return (
    <>
      <Section>
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>{tHome('eyebrow')}</Eyebrow>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
              {tHome('title')}
            </h1>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-graphite">
              {t('intro')}
            </p>
          </Reveal>

          {/* ---------- The three ways, honest scope ---------- */}
          <div className={passEnabled ? 'mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3' : 'mx-auto mt-12 grid max-w-3xl gap-5 md:grid-cols-2'}>
            {/* 1 — à l'unité */}
            <Reveal className="h-full">
              <div className={`${cardBase} border-ink/15 bg-paper-light`}>
                <IconTag size={24} stroke={1.6} className="text-teal" />
                <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-teal">
                  {tHome('unit.badge')}
                </span>
                <h2 className="mt-1.5 font-display text-xl font-bold text-ink">
                  {tHome('unit.title')}
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-graphite">
                  {tHome('unit.text')}
                </p>
                <p className="mt-2.5 text-xs leading-snug text-teal">{t('unit.scope')}</p>
                {minUsd !== null && (
                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-mono text-xs uppercase tracking-wide text-ink/50">
                      {tHome('unit.from')}
                    </span>
                    <Price usd={minUsd} className="font-display text-3xl font-black text-ink" />
                    <span className="font-mono text-xs text-graphite/60">{tc('lifetime')}</span>
                  </p>
                )}
                <span className="mt-auto block pt-6">
                  <Link href="/formations" className={buttonClasses('ghost', 'md', 'w-full')}>
                    {tHome('unit.cta')}
                  </Link>
                </span>
              </div>
            </Reveal>

            {/* 2 — pass yon anseyan */}
            <Reveal delay={70} className="h-full">
              <div className={`${cardBase} border-ink/15 bg-paper-light`}>
                <IconRepeat size={24} stroke={1.6} className="text-teal" />
                <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-teal">
                  {tHome('teacher.badge')}
                </span>
                <h2 className="mt-1.5 font-display text-xl font-bold text-ink">
                  {tHome('teacher.title')}
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-graphite">
                  {tHome('teacher.text')}
                </p>
                {/* GENERIC scope wording here (owner: a named teacher on the
                    pricing page « semble favoritisme ») — checkout keeps the
                    named version where it really is that teacher's pass. */}
                <p className="mt-2.5 text-xs leading-snug text-teal">{tHome('teacher.scopeGeneric')}</p>
                <ul className="mt-4 space-y-2">
                  {teacherPerks.map((perk, i) => (
                    <li key={i} className={perkRow}>
                      <IconCheck size={17} className="mt-0.5 shrink-0 text-teal" />
                      {perk}
                    </li>
                  ))}
                </ul>
                {/* Framed as an EXAMPLE — see PricingTriptych's identical
                    block: tag, concept sentence, then the illustrative name. */}
                {example && (
                  <div className="mt-5 rounded-lg border border-dashed border-ink/20 bg-paper/60 p-3">
                    <span className="rounded bg-ink/[0.07] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink/50">
                      {tHome('teacher.exampleTag')}
                    </span>
                    <p className="mt-1.5 text-[11px] leading-snug text-graphite/65">{tHome('teacher.exampleNote')}</p>
                    <p className="mt-1 font-mono text-[12px] text-ink/75">
                      {tHome('teacher.exampleLine', { name: example.name })} —{' '}
                      <Price usd={example.priceCentsMonthly / 100} className="font-semibold" />
                      {tc('perMonth')}
                    </p>
                  </div>
                )}
                <span className="mt-auto block pt-6">
                  <Link href="/prof" className={buttonClasses('ghost', 'md', 'w-full')}>
                    {tHome('teacher.cta')}
                  </Link>
                </span>
              </div>
            </Reveal>

            {/* 3 — Pass PNICE — only while ON SALE (/admin/prix switch). */}
            {passEnabled && (
            <Reveal delay={140} className="h-full">
              <div
                className={`${cardBase} border-2 border-ochre bg-ochre/[0.06] shadow-lg shadow-ochre/10`}
              >
                <IconStack2 size={24} stroke={1.6} className="text-ochre" />
                <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-ochre">
                  {tHome('platform.badge')}
                </span>
                <h2 className="mt-1.5 font-display text-xl font-bold text-ink">
                  {tHome('platform.title')}
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-graphite">
                  {tHome('platform.text')}
                </p>
                <p className="mt-2.5 text-xs leading-snug text-teal">
                  {tCheckout('subAllCoursesNote')}
                </p>
                <ul className="mt-4 space-y-2">
                  {platformPerks.map((perk, i) => (
                    <li key={i} className={perkRow}>
                      <IconCheck size={17} className="mt-0.5 shrink-0 text-teal" />
                      {perk}
                    </li>
                  ))}
                </ul>
                <p className="mt-5">
                  <span className="flex items-baseline gap-1">
                    <Price
                      usd={platformPassUsd}
                      className="font-display text-4xl font-black leading-none text-ink"
                    />
                    <span className="font-mono text-xs text-graphite/60">{tc('perMonth')}</span>
                  </span>
                  <span className="mt-1 block font-mono text-xs text-graphite/60">
                    <PriceSecondary usd={platformPassUsd} />
                    {tc('perMonth')}
                  </span>
                </p>
                <span className="mt-auto block pt-6">
                  <AuthCta
                    href="/checkout?plan=sub"
                    className={buttonClasses('primary', 'md', 'w-full')}
                  >
                    {tHome('platform.cta')}
                  </AuthCta>
                </span>
              </div>
            </Reveal>
            )}
          </div>

          {/* ---------- Worked examples — real numbers as document data ---------- */}
          <Reveal className="mx-auto mt-14 max-w-3xl">
            <div className="overflow-hidden rounded-2xl border border-ink/15 bg-paper">
              <p className="border-b border-ink/10 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/55 md:px-7">
                {t('examples.title')}
              </p>
              <ul className="divide-y divide-ink/10">
                {exampleCourse && (
                  <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 md:px-7">
                    <span className="min-w-0 text-sm text-graphite">
                      {t('examples.unitLine', {
                        title: courseTitle(exampleCourse, locale),
                      })}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold text-ink">
                      <Price usd={exampleCourse.priceUsd} /> · {tc('lifetime')}
                    </span>
                  </li>
                )}
                {example && (
                  <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 md:px-7">
                    <span className="min-w-0 text-sm text-graphite">
                      {t('examples.teacherLine', { name: example.name })}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-semibold text-ink">
                      <Price usd={example.priceCentsMonthly / 100} />
                      {tc('perMonth')}
                    </span>
                  </li>
                )}
                {passEnabled && (
                <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 md:px-7">
                  <span className="min-w-0 text-sm text-graphite">
                    {t('examples.platformLine')}
                  </span>
                  <span className="shrink-0 font-mono text-sm font-semibold text-ink">
                    <Price usd={platformPassUsd} />
                    {tc('perMonth')}
                  </span>
                </li>
                )}
              </ul>
              <p className="border-t border-ink/10 px-5 py-3 text-xs leading-relaxed text-graphite/60 md:px-7">
                {t('examples.note')}
              </p>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ---------- Pricing FAQ ---------- */}
      <Section className="bg-paper pt-0 md:pt-0">
        <Container className="max-w-3xl">
          <Reveal className="text-center">
            <Eyebrow>{t('faqEyebrow')}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold text-ink md:text-4xl">
              {t('faqTitle')}
            </h2>
          </Reveal>
          <Reveal delay={90}>
            <dl className="mt-10 border-y border-ink/10">
              {faqItems.map((item, i) => (
                <div key={i} className="border-b border-ink/10 py-5 last:border-b-0">
                  <dt className="font-display text-lg font-bold text-ink">{item.q}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-graphite/85">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-center">
              <Link
                href="/legal/remboursement"
                className="font-mono text-xs uppercase tracking-[0.12em] text-teal underline decoration-teal/40 underline-offset-4 transition-colors hover:text-ochre"
              >
                {t('refundLink')}
              </Link>
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* ---------- Final CTA band ---------- */}
      <section className="bg-ink py-16 text-center text-paper-light">
        <Container>
          <h2 className="mx-auto max-w-xl font-display text-3xl font-black md:text-4xl">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-paper-light/75">{t('cta.body')}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/formations" className={buttonClasses('primary', 'lg')}>
              {t('cta.browse')}
            </Link>
            <AuthCta
              href="/checkout?plan=sub"
              className={buttonClasses(
                'ghost',
                'lg',
                '!border-paper-light/30 !text-paper-light hover:!border-paper-light/60',
              )}
            >
              {tHome('platform.cta')}
            </AuthCta>
          </div>
        </Container>
      </section>
    </>
  );
}
