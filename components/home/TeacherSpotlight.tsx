import { getLocale, getTranslations } from 'next-intl/server';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { SmartImage } from '@/components/ui/SmartImage';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { teachers, teacherCourses, teacherShortBio } from '@/data/teachers';
import {
  subscription,
  subscriptionPerks_ht,
  subscriptionPerks_fr,
} from '@/data/pricing';
import { siteImageSrc } from '@/lib/courseImage';

/**
 * PNICE Academy presented as the flagship teacher (M1 target flow #4) — a
 * teacher card (photo, name, stat line, bio, link to /prof/[slug]) that
 * ALSO carries the attributed $79 pass: "Abònman PNICE Academy", not "the
 * platform subscription". `id="pri"` is the anchor nav/footer's `/#pri`
 * link already points at (previously the removed global Pricing table).
 *
 * Teacher #1 today (data/teachers.ts has exactly one), but reads from the
 * registry rather than hardcoding — when more teachers exist, this becomes
 * "the featured teacher" instead of "the only teacher".
 */
export async function TeacherSpotlight() {
  const [t, tc, locale] = await Promise.all([
    getTranslations('home.spotlight'),
    getTranslations('common'),
    getLocale(),
  ]);

  const teacher = teachers[0];
  const courseCount = teacherCourses(teacher).length;
  const shortBio = teacherShortBio(teacher, locale);
  const photo = siteImageSrc(teacher.imageName);
  const perks = locale === 'ht' ? subscriptionPerks_ht : subscriptionPerks_fr;

  return (
    <Section id="pri" className="bg-paper">
      <Container>
        <Reveal className="text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
            {t('title')}
          </h2>
        </Reveal>

        <Reveal delay={90}>
          <div className="mt-10 overflow-hidden rounded-2xl border border-ink/15 bg-paper-light shadow-[0_24px_56px_-32px_rgba(16,32,74,0.35)] md:grid md:grid-cols-2">
            {/* the teacher */}
            <div className="p-7 md:p-10">
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-ink/15 bg-ink">
                  <SmartImage
                    src={photo}
                    alt={teacher.displayName}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-teal">
                    {t('kicker')}
                  </span>
                  <h3 className="mt-1 font-display text-2xl font-black leading-tight text-ink">
                    {teacher.displayName}
                  </h3>
                </div>
              </div>

              <p className="mt-5 font-mono text-xs uppercase tracking-[0.06em] text-ink/55">
                {t('statLine', { count: courseCount })}
              </p>

              <p className="mt-4 leading-relaxed text-graphite">{shortBio}</p>

              <Link
                href={`/prof/${teacher.slug}`}
                className="group mt-5 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-ink/70 transition-colors hover:text-ochre"
              >
                {t('profileLink')}
                <IconArrowRight
                  size={14}
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </Link>
            </div>

            {/* his $79 pass */}
            <div className="flex flex-col justify-center border-t-2 border-ochre/40 bg-ochre/[0.06] p-7 md:border-l-2 md:border-t-0 md:p-10">
              <Eyebrow>{t('sub.eyebrow')}</Eyebrow>
              <h3 className="mt-2 font-display text-xl font-bold text-ink">
                {t('sub.title')}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-graphite">
                {t('sub.body', { count: courseCount })}
              </p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <Price
                  usd={subscription.usd}
                  className="font-display text-5xl font-black leading-none text-ink"
                />
                <span className="font-mono text-sm text-graphite/70">
                  {tc('perMonth')}
                </span>
              </div>
              <p className="mt-1 font-mono text-sm text-graphite/60">
                <PriceSecondary usd={subscription.usd} />
                {tc('perMonth')}
              </p>

              <ul className="mt-5 space-y-2">
                {perks.map((perk, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-graphite">
                    <IconCheck size={17} className="mt-0.5 shrink-0 text-teal" />
                    {perk}
                  </li>
                ))}
              </ul>

              <AuthCta
                href="/checkout?plan=sub"
                className={buttonClasses('primary', 'lg', 'mt-6 w-full')}
              >
                {t('sub.cta')}
              </AuthCta>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
