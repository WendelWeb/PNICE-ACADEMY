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
import { getMyCourses, getMyStudioSummary } from '@/lib/teacher/studio';
import { CourseCard } from '@/components/teacher/studio/CourseCard';
import { WithdrawalPanel } from '@/components/teacher/studio/WithdrawalPanel';

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

  const [profile, courses, summary] = await Promise.all([
    getTeacherProfile(userId),
    getMyCourses(userId),
    getMyStudioSummary(userId),
  ]);

  return (
    <Section>
      <Container>
        <Reveal>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-2 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
            {profile?.displayName ? t('greetingNamed', { name: profile.displayName }) : t('greeting')}
          </h1>
        </Reveal>

        <Reveal delay={80} className="mt-8">
          <WithdrawalPanel
            balanceCents={summary.balanceCents}
            thresholdCents={summary.thresholdCents}
            pendingWithdrawalCents={summary.pendingWithdrawalCents}
            videoQuotaMinutes={summary.videoQuotaMinutes}
            ledger={summary.ledger}
            locale={locale}
          />
        </Reveal>

        <Reveal delay={140} className="mt-12">
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
      </Container>
    </Section>
  );
}
