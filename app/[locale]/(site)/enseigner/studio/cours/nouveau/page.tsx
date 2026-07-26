import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { Link } from '@/i18n/routing';
import { clerkEnabled } from '@/lib/clerk';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { isApprovedTeacher } from '@/lib/teacher/profile';
import { CreateMyCourseForm } from '@/components/teacher/studio/CreateMyCourseForm';

export const dynamic = 'force-dynamic';

/** /enseigner/studio/cours/nouveau — same studio guard as the dashboard. */
export default async function NewMyCoursePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('teach.studio.create');

  if (!clerkEnabled) redirect(`/${locale}/enseigner`);
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect(`/${locale}/enseigner`);
  if (!dbConfigured()) redirect(`/${locale}/enseigner`);

  const userId = await resolveUserId(clerkId);
  if (!userId) redirect(`/${locale}/enseigner`);
  const approved = await isApprovedTeacher(userId);
  if (!approved) redirect(`/${locale}/enseigner`);

  return (
    <Section>
      <Container className="max-w-2xl">
        <Link href="/enseigner/studio" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
          <IconArrowLeft size={14} /> {t('back')}
        </Link>
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">{t('title')}</h1>
        <div className="mt-4">
          <CreateMyCourseForm />
        </div>
      </Container>
    </Section>
  );
}
