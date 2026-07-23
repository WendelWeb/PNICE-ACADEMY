import { getTranslations } from 'next-intl/server';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { Sceau } from '@/components/ui/Sceau';
import { TeachInterestCta } from '@/components/home/TeachInterestCta';

/**
 * « Byento w ap ka anseye » — the marketplace teaser (U3/A2). A kraft panel
 * previewing the future teacher path: the money facts as mono "document
 * data", the persuasive pitch, a straight link to /enseigner (built in
 * U4bis) plus the interest capture (`TeachInterestCta`). id="anseye" is the
 * anchor the nav/footer already point at (U1).
 */
export async function TeachTeaser() {
  const t = await getTranslations('home.teachTeaser');
  const facts = t.raw('facts') as string[];

  return (
    <Section id="anseye" className="bg-paper">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-ink/15 bg-paper-light p-8 shadow-[0_20px_48px_-32px_rgba(16,32,74,0.35)] md:p-12">
            <div className="grid gap-10 md:grid-cols-[1.3fr_auto] md:items-center">
              <div>
                <Eyebrow>{t('eyebrow')}</Eyebrow>
                <h2 className="mt-3 max-w-xl font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                  {t('title')}
                </h2>
                <p className="mt-4 max-w-xl leading-relaxed text-graphite">{t('body')}</p>

                <ul className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2">
                  {facts.map((fact, i) => (
                    <li key={fact} className="flex items-center gap-2">
                      {i > 0 && (
                        <span aria-hidden="true" className="text-ink/25">
                          ·
                        </span>
                      )}
                      <span className="rounded border border-teal/25 bg-teal/[0.06] px-2.5 py-1 font-mono text-xs uppercase tracking-[0.08em] text-teal">
                        {fact}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <Link href="/enseigner" className={buttonClasses('primary', 'lg')}>
                    {t('ctaLearnMore')}
                  </Link>
                  <TeachInterestCta />
                </div>
              </div>

              <div className="hidden justify-self-center md:block">
                <Sceau size="lg" tone="ink" rotate={-6}>
                  <span className="text-[9px] tracking-[0.2em]">{t('sealTop')}</span>
                  <span className="my-1 font-display text-3xl font-black leading-none">70%</span>
                  <span className="text-[9px] tracking-[0.2em]">{t('sealBottom')}</span>
                </Sceau>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
