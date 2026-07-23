import { getTranslations } from 'next-intl/server';
import { IconRepeat, IconTag } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';

/**
 * « De fason pou aprann » (M1 target flow #5) — replaces the old global
 * two-column Pricing table. Teacher-agnostic on purpose: subscribe to a
 * teacher (today: PNICE Academy's $79 pass, presented in TeacherSpotlight
 * above) OR buy a single course for life — plus the 3-step how-it-works.
 * No prices rendered here; this section is philosophy + mechanics only, so
 * it never goes stale as more teachers (with their own prices) join.
 */
export async function HowMarketplace() {
  const t = await getTranslations('home.how');
  const steps = t.raw('steps.items') as { title: string; text: string }[];

  return (
    <Section>
      <Container>
        <Reveal className="text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold text-ink md:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-graphite">
            {t('philosophy')}
          </p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          <Reveal className="card-hover h-full rounded-2xl border border-ink/15 bg-paper-light p-8">
            <IconRepeat size={26} stroke={1.6} className="text-teal" />
            <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-teal">
              {t('ways.sub.badge')}
            </span>
            <h3 className="mt-1.5 font-display text-xl font-bold text-ink">
              {t('ways.sub.title')}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-graphite">
              {t('ways.sub.text')}
            </p>
            <Link href="/#pri" className={buttonClasses('ghost', 'md', 'mt-6')}>
              {t('ways.sub.cta')}
            </Link>
          </Reveal>

          <Reveal
            delay={90}
            className="card-hover h-full rounded-2xl border border-ink/15 bg-paper-light p-8"
          >
            <IconTag size={26} stroke={1.6} className="text-ochre" />
            <span className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-ochre">
              {t('ways.unit.badge')}
            </span>
            <h3 className="mt-1.5 font-display text-xl font-bold text-ink">
              {t('ways.unit.title')}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-graphite">
              {t('ways.unit.text')}
            </p>
            <Link href="/formations" className={buttonClasses('ghost', 'md', 'mt-6')}>
              {t('ways.unit.cta')}
            </Link>
          </Reveal>
        </div>

        <div className="mx-auto mt-16 max-w-4xl">
          <Reveal className="text-center">
            <Eyebrow>{t('steps.eyebrow')}</Eyebrow>
            <h3 className="mt-3 font-display text-2xl font-extrabold text-ink md:text-3xl">
              {t('steps.title')}
            </h3>
          </Reveal>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 70}>
                <div className="h-full rounded-lg border border-ink/10 bg-paper-light p-6">
                  <span className="font-mono text-sm font-semibold text-ochre">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h4 className="mt-3 font-display text-lg font-bold text-ink">
                    {step.title}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-graphite/80">
                    {step.text}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
