import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { CourseFaqList } from '@/components/courses/CourseFaqList';
import { TeachInterestCta } from '@/components/home/TeachInterestCta';
import { TeacherApplyEntry } from '@/components/teacher/TeacherApplyEntry';
import { teachers } from '@/data/teachers';
import { clerkEnabled } from '@/lib/clerk';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { getTeacherProfile, type TeacherProfile } from '@/lib/teacher/profile';
import { cn } from '@/lib/cn';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'teach' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

type Step = { title: string; body: string };
type FaqItem = { q: string; a: string };

/**
 * `/enseigner` — the become-a-teacher journey (U4bis) + Task C3-T2's real
 * onboarding entry point. Signed-out visitors get the persuasive journey and
 * an auth-gated CTA; signed-in visitors get the SAME journey plus a live
 * state machine at `#kandidati` (`TeacherApplyEntry`): no profile yet →
 * start the wizard, pending → their status, approved → a "studio's coming"
 * note (the studio itself is C3-T4, still byento — the ONE place that
 * framing survives), rejected → the review note + re-apply, suspended → a
 * notice. Applications are genuinely open now (unlike the earlier U4bis
 * "byento" placeholder) — the copy reflects that everywhere except the
 * studio.
 */
export default async function EnseignerPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('teach');

  const facts = t.raw('facts') as string[];
  const steps = t.raw('steps') as Step[];
  const faqItems = t.raw('faq') as FaqItem[];

  // Resolve the signed-in visitor's teacher-application status, if any.
  // Every step here degrades quietly: Clerk disabled, signed out, no DB, or
  // no `users` row yet ⇒ `profile` stays null and the page still renders
  // (never throws) — same gated-read discipline as lib/teacher/profile.ts.
  let signedIn = false;
  let profile: TeacherProfile | null = null;
  if (clerkEnabled) {
    const { userId: clerkId } = await auth();
    signedIn = Boolean(clerkId);
    if (clerkId && dbConfigured()) {
      const internalId = await resolveUserId(clerkId);
      if (internalId) profile = await getTeacherProfile(internalId);
    }
  }

  const openBadge = (
    <span className="rounded-full border border-teal/40 bg-teal/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-teal">
      {t('openBadge')}
    </span>
  );

  const heroCta = signedIn ? (
    <a href="#kandidati" className={buttonClasses('primary', 'lg')}>
      {profile ? t('apply.viewStatusCta') : t('apply.startCta')}
    </a>
  ) : (
    <TeachInterestCta variant="primary" />
  );

  return (
    <>
      {/* ---------- Hero: the promise ---------- */}
      <section className="relative overflow-x-clip">
        <Container className="pt-14 md:pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex flex-wrap items-center justify-center gap-2.5">
              <Eyebrow>{t('eyebrow')}</Eyebrow>
              {openBadge}
            </p>
            <h1 className="mt-4 font-display text-[2.6rem] font-black leading-[0.95] text-ink md:text-6xl">
              {t('title')}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-graphite md:text-lg">
              {t('subtitle')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {heroCta}
              <Link
                href={`/prof/${teachers[0].slug}`}
                className={buttonClasses('ghost', 'lg')}
              >
                {t('exampleCta')}
              </Link>
            </div>
          </div>
        </Container>

        {/* money facts — document data, not decoration */}
        <div className="mt-12 border-y border-ink/10 bg-paper/40 md:mt-16">
          <Container>
            <ul className="grid grid-cols-3 sm:divide-x sm:divide-ink/10">
              {facts.map((fact) => (
                <li
                  key={fact}
                  className="px-2 py-3 text-center font-mono text-[11px] tracking-[0.04em] text-ink/75 sm:text-xs md:py-4"
                >
                  {fact}
                </li>
              ))}
            </ul>
          </Container>
        </div>
      </section>

      {/* ---------- The route: 4 real stations ---------- */}
      <Section id="wout">
        <Container>
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t('stepsEyebrow')}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
              {t('stepsTitle')}
            </h2>
          </Reveal>

          <div className="relative mx-auto mt-12 max-w-xl md:mt-16">
            {/* the teal thread the stations sit on */}
            <div
              aria-hidden="true"
              className="route-thread route-thread-teal route-thread-animated absolute bottom-5 left-[19px] top-5 w-[2px]"
            />
            <ol className="space-y-10 md:space-y-12">
              {steps.map((step, i) => {
                const last = i === steps.length - 1;
                return (
                  <li key={step.title} className="relative">
                    <Reveal
                      delay={i * 80}
                      className="grid grid-cols-[40px_1fr] gap-x-4 sm:gap-x-6"
                    >
                      <span
                        className={cn(
                          'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-paper-light font-mono text-sm font-semibold',
                          // the last station is the destination: the payout
                          last
                            ? 'border-ochre text-ochre'
                            : 'border-teal text-teal',
                        )}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="pt-1">
                        <h3 className="font-display text-xl font-bold leading-tight text-ink md:text-2xl">
                          {step.title}
                        </h3>
                        <p className="mt-2 leading-relaxed text-graphite">
                          {step.body}
                        </p>
                      </div>
                    </Reveal>
                  </li>
                );
              })}
            </ol>
          </div>
        </Container>
      </Section>

      {/* ---------- FAQ ---------- */}
      <Section className="bg-paper">
        <Container>
          <div className="mx-auto max-w-2xl">
            <Reveal className="text-center">
              <Eyebrow>{t('faqEyebrow')}</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                {t('faqTitle')}
              </h2>
            </Reveal>
            <Reveal delay={90} className="mt-8">
              <CourseFaqList items={faqItems} />
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* ---------- Application / status — the real entry point ---------- */}
      <Section id="kandidati">
        <Container>
          <Reveal className="mx-auto max-w-2xl">
            {signedIn ? (
              <TeacherApplyEntry profile={profile} />
            ) : (
              <div className="rounded-2xl border border-ink/15 bg-paper p-8 text-center shadow-[0_20px_48px_-32px_rgba(16,32,74,0.35)] md:p-12">
                {openBadge}
                <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                  {t('final.title')}
                </h2>
                <p className="mx-auto mt-3 max-w-xl leading-relaxed text-graphite">
                  {t('final.body')}
                </p>
                <div className="mt-7 flex justify-center">
                  <TeachInterestCta variant="primary" />
                </div>
              </div>
            )}
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
