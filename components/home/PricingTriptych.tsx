import { getTranslations } from 'next-intl/server';
import { IconArrowRight, IconRepeat, IconStack2, IconTag } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { getPlatformPassPriceCents } from '@/lib/platformPrice';
import { isPlatformPassEnabled } from '@/lib/admin/platform/store';
import { pickPlanExample, minCoursePriceUsd } from '@/lib/home/source';
import type { PublicTeacher } from '@/lib/teacher/public';
import type { Course } from '@/data/courses';

/**
 * « Twa fason pou aprann » (Stage: the living manifest, section 5) — the
 * pricing triptych, finally truthful to the two-pass model:
 *   1. À l'unité — one price, yours for life; the « Depi $X » line is the
 *      real lowest catalogue price (nothing when the catalogue is empty).
 *   2. Pass yon anseyan — THAT teacher's whole catalogue, priced by the
 *      teacher; the example is a real teacher's real plan price
 *      (lib/home/source.ts's pickPlanExample), linking to their /prof page
 *      where the pass is actually sold.
 *   3. Pass PNICE — everything on the platform, owner-priced
 *      (getPlatformPassPriceCents), with the live-FX HTG line.
 * Scope wording reuses checkout's OWN scopeNote keys so the promise here
 * can never drift from what the pay page says. `id="pri"` keeps the anchor
 * nav/footer historically pointed at; « Tout detay yo » links the /pri page
 * (ships next stage).
 */
export async function PricingTriptych({
  teachers,
  courses,
}: {
  teachers: PublicTeacher[];
  courses: Course[];
}) {
  const [t, tCheckout, tc, platformPassCents, passEnabled] = await Promise.all([
    getTranslations('home.pricing'),
    getTranslations('checkout'),
    getTranslations('common'),
    getPlatformPassPriceCents(),
    isPlatformPassEnabled(),
  ]);

  const example = pickPlanExample(teachers);
  const minUsd = minCoursePriceUsd(courses);
  const platformPassUsd = platformPassCents / 100;

  const cardBase = 'flex h-full flex-col rounded-2xl border p-7 md:p-8';

  return (
    <Section id="pri">
      <Container>
        <Reveal className="text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-graphite">
            {t('philosophy')}
          </p>
        </Reveal>

        {/* Two columns when the pass is off sale — never an empty hole. */}
        <div className={cn('mx-auto mt-12 grid gap-5', passEnabled ? 'max-w-5xl md:grid-cols-3' : 'max-w-3xl md:grid-cols-2')}>
          {/* 1 — à l'unité */}
          <Reveal className="h-full">
            <div className={`${cardBase} border-ink/15 bg-paper-light`}>
              <IconTag size={24} stroke={1.6} className="text-teal" />
              <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-teal">
                {t('unit.badge')}
              </span>
              <h3 className="mt-1.5 font-display text-xl font-bold text-ink">
                {t('unit.title')}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-graphite">{t('unit.text')}</p>
              {minUsd !== null && (
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-mono text-xs uppercase tracking-wide text-ink/50">
                    {t('unit.from')}
                  </span>
                  <Price usd={minUsd} className="font-display text-3xl font-black text-ink" />
                  <span className="font-mono text-xs text-graphite/60">{tc('lifetime')}</span>
                </p>
              )}
              <span className="mt-auto block pt-6">
                <Link href="/formations" className={buttonClasses('ghost', 'md', 'w-full')}>
                  {t('unit.cta')}
                </Link>
              </span>
            </div>
          </Reveal>

          {/* 2 — pass yon anseyan */}
          <Reveal delay={70} className="h-full">
            <div className={`${cardBase} border-ink/15 bg-paper-light`}>
              <IconRepeat size={24} stroke={1.6} className="text-teal" />
              <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-teal">
                {t('teacher.badge')}
              </span>
              <h3 className="mt-1.5 font-display text-xl font-bold text-ink">
                {t('teacher.title')}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-graphite">{t('teacher.text')}</p>
              {/* GENERIC scope wording on this marketing card (owner: naming
                  one teacher here « semble favoritisme ») — the NAMED scope
                  note stays at checkout, where it really is that teacher's
                  pass being bought. */}
              <p className="mt-2.5 text-xs leading-snug text-teal">{t('teacher.scopeGeneric')}</p>
              {/* The example is FRAMED as an example: dashed box, « Egzanp »
                  tag, and the sentence that sells the concept (« each teacher
                  sets their own price ») before any name appears — the name
                  illustrates, it never headlines. */}
              {example && (
                <div className="mt-5 rounded-lg border border-dashed border-ink/20 bg-paper/60 p-3">
                  <span className="rounded bg-ink/[0.07] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink/50">
                    {t('teacher.exampleTag')}
                  </span>
                  <p className="mt-1.5 text-[11px] leading-snug text-graphite/65">{t('teacher.exampleNote')}</p>
                  <p className="mt-1 font-mono text-[12px] text-ink/75">
                    {t('teacher.exampleLine', { name: example.name })} —{' '}
                    <Price usd={example.priceCentsMonthly / 100} className="font-semibold" />
                    {tc('perMonth')}
                  </p>
                </div>
              )}
              <span className="mt-auto block pt-6">
                <Link href="/prof" className={buttonClasses('ghost', 'md', 'w-full')}>
                  {t('teacher.cta')}
                </Link>
              </span>
            </div>
          </Reveal>

          {/* 3 — Pass PNICE — only while the owner has it ON SALE
              (/admin/prix master switch): OFF removes the whole card. */}
          {passEnabled && (
          <Reveal delay={140} className="h-full">
            <div className={`${cardBase} border-2 border-ochre bg-ochre/[0.06] shadow-lg shadow-ochre/10`}>
              <IconStack2 size={24} stroke={1.6} className="text-ochre" />
              <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-ochre">
                {t('platform.badge')}
              </span>
              <h3 className="mt-1.5 font-display text-xl font-bold text-ink">
                {t('platform.title')}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-graphite">{t('platform.text')}</p>
              <p className="mt-2.5 text-xs leading-snug text-teal">
                {tCheckout('subAllCoursesNote')}
              </p>
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
                  {t('platform.cta')}
                </AuthCta>
              </span>
            </div>
          </Reveal>
          )}
        </div>

        <p className="mt-8 text-center">
          <Link
            href="/pri"
            className="group inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-ink/60 transition-colors hover:text-ochre"
          >
            {t('details')}
            <IconArrowRight
              size={14}
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        </p>
      </Container>
    </Section>
  );
}
