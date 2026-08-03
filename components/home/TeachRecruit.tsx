import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { Sceau } from '@/components/ui/Sceau';

/**
 * The teach-recruit panel (Stage: the living manifest, section 6 — replaces
 * TeachTeaser). Every fact chip is a claim the product actually backs
 * today: 70/30 split (lib/teacher/profile.ts's commission default), the
 * teacher sets their own price (studio), payouts to MonCash/NatCash/PayPal/
 * bank from $25 (lib/teacher/apply-validation.ts's PAYOUT_METHODS + the
 * $25 threshold), and admin review before anything goes public
 * (lib/courses/review-actions.ts). Applications are OPEN — the CTA goes
 * straight to /enseigner. `id="anseye"` keeps the anchor nav/footer
 * historically pointed at.
 */
export async function TeachRecruit() {
  const t = await getTranslations('home.teach');
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

                <div className="mt-8">
                  <Link href="/enseigner" className={buttonClasses('primary', 'lg')}>
                    {t('cta')}
                  </Link>
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
