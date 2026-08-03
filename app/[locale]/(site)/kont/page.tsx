import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { Section, Container } from '@/components/ui/Section';
import { AccountSettings } from '@/components/kont/AccountSettings';
import type { KontCourse } from '@/components/kont/CoursesTab';
import { clerkEnabled } from '@/lib/clerk';
import { currentUserIsApprovedTeacher } from '@/lib/teacher/profile';
import { getMyAccountData } from '@/lib/learner/account';
import { getMyLearning } from '@/lib/learner/access';
import { getCourseBySlug } from '@/lib/courses/source';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mon kont — PNICE Academy' };

export default async function AccountPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  // Task: studio access everywhere — same gated, never-throw server check
  // Nav.tsx uses, so /kont's "Mon studio" entry and the nav's studio badge
  // can never disagree on whether the signed-in user is an approved teacher.
  const approvedTeacher = clerkEnabled ? await currentUserIsApprovedTeacher() : false;

  // Stage: learner account — the tab panel's REAL data, loaded server-side
  // (all gated + never-throw: empty bundle with no DB/keys) and passed down
  // so subscriptions, purchases, certificates, tickets and the honest
  // notifications feed render without client round-trips.
  const clerkId = clerkEnabled ? (await auth()).userId : null;
  const [account, learning] = await Promise.all([
    getMyAccountData(clerkId ?? ''),
    clerkId
      ? getMyLearning(clerkId)
      : Promise.resolve({ courses: [], hasSubscription: false, hasPlatformPass: false, teacherPassNames: [] }),
  ]);

  const resolvedCourses = await Promise.all(
    learning.courses.map(async (c): Promise<KontCourse | null> => {
      const course = await getCourseBySlug(c.slug);
      if (!course) return null;
      return {
        slug: c.slug,
        titleHt: course.title_ht,
        titleFr: course.title_fr,
        done: c.lessonsDone,
        total: c.lessonsTotal,
        next: c.lastLessonIndex,
      };
    }),
  );
  const courses = resolvedCourses.filter((c): c is KontCourse => c !== null);

  return (
    <Section>
      <Container className="max-w-4xl">
        {clerkEnabled ? (
          <AccountSettings isApprovedTeacher={approvedTeacher} account={account} courses={courses} />
        ) : (
          <p className="py-20 text-center font-mono text-sm text-graphite/60">
            Clerk pa konfigire / Clerk non configuré.
          </p>
        )}
      </Container>
    </Section>
  );
}
