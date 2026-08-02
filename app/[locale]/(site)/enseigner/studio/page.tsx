import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { IconPlus } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { clerkEnabled } from '@/lib/clerk';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { isApprovedTeacher, getTeacherProfile } from '@/lib/teacher/profile';
import { getMyCourses, getMyStudioSummary, getMyPlan } from '@/lib/teacher/studio';
import { getFxRate } from '@/lib/fx';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import { CourseCard } from '@/components/teacher/studio/CourseCard';
import { WithdrawalPanel } from '@/components/teacher/studio/WithdrawalPanel';
import { PayoutSettingsForm } from '@/components/teacher/studio/PayoutSettingsForm';
import { PlanPricingForm } from '@/components/teacher/studio/PlanPricingForm';

// Per-request Clerk identity + live DB reads (balance, courses) — never
// cache across teachers.
export const dynamic = 'force-dynamic';

/**
 * /enseigner/studio — the teacher studio dashboard (Task C3-T4). GUARD:
 * signed-in + an APPROVED `teacher_profiles` row, else redirect to
 * `/enseigner` (where a pending/rejected/suspended applicant already sees
 * their status, and a signed-out visitor sees the apply CTA — this page
 * never renders any of that itself).
 */
export default async function StudioPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('teach.studio');

  if (!clerkEnabled) redirect(`/${locale}/enseigner`);
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect(`/${locale}/enseigner`);
  if (!dbConfigured()) redirect(`/${locale}/enseigner`);

  const userId = await resolveUserId(clerkId);
  if (!userId) redirect(`/${locale}/enseigner`);

  const approved = await isApprovedTeacher(userId);
  if (!approved) redirect(`/${locale}/enseigner`);

  const [profile, courses, summary, myPlan, fxRateHtg] = await Promise.all([
    getTeacherProfile(userId),
    getMyCourses(userId),
    getMyStudioSummary(userId),
    getMyPlan(userId),
    getFxRate(),
  ]);
  // No plan row yet (brand-new teacher) -> the platform's documented default
  // (data/pricing.ts's SUBSCRIPTION_USD, mirroring platform_settings.
  // subscription_usd_cents's seed value) is shown as the starting price,
  // exactly what a first `updateMyPlanAction` call would otherwise leave
  // unset.
  const planPriceCentsMonthly = myPlan?.priceCentsMonthly ?? SUBSCRIPTION_USD * 100;

  return (
    <Section>
      <Container>
        <Reveal>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-2 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
            {profile?.displayName ? t('greetingNamed', { name: profile.displayName }) : t('greeting')}
          </h1>
        </Reveal>

        {/* Stage 1 — task-first: a teacher opens the studio to work on their
            COURSES, so "Fòmasyon mwen yo" leads; the three finance panels
            (plan price, payout method, balance) follow below. */}
        <Reveal delay={80} className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold text-ink">{t('myCourses')}</h2>
            <Link href="/enseigner/studio/cours/nouveau" className={buttonClasses('primary', 'md')}>
              <IconPlus size={16} /> {t('newCourse')}
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-ink/20 bg-paper-light px-8 py-14 text-center">
              <p className="text-graphite/70">{t('emptyCourses')}</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {courses.map((c) => (
                <CourseCard key={c.slug} course={c} locale={locale} />
              ))}
            </div>
          )}
        </Reveal>

        <Reveal delay={110} className="mt-12">
          <PlanPricingForm priceCentsMonthly={planPriceCentsMonthly} fxRateHtg={fxRateHtg} />
        </Reveal>

        <Reveal delay={125} className="mt-4">
          <PayoutSettingsForm payoutMethod={profile?.payoutMethod ?? null} payoutDestination={profile?.payoutDestination ?? null} />
        </Reveal>

        <Reveal delay={140} className="mt-4">
          <WithdrawalPanel
            balanceCents={summary.balanceCents}
            thresholdCents={summary.thresholdCents}
            pendingWithdrawalCents={summary.pendingWithdrawalCents}
            videoQuotaMinutes={summary.videoQuotaMinutes}
            ledger={summary.ledger}
            locale={locale}
          />
        </Reveal>
      </Container>
    </Section>
  );
}
