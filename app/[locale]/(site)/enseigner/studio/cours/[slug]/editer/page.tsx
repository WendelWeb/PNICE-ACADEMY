import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { Link } from '@/i18n/routing';
import { clerkEnabled } from '@/lib/clerk';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { isApprovedTeacher } from '@/lib/teacher/profile';
import { getMyCourse, getMyCourses } from '@/lib/teacher/studio';
import { CourseEditor } from '@/components/admin/content/CourseEditor';
import { LessonsManager, type LessonActions } from '@/components/admin/content/LessonsManager';
import { ImagesManager, type ImageActions } from '@/components/admin/content/ImagesManager';
import { StudioStatusBar } from '@/components/teacher/studio/StudioStatusBar';
import {
  updateMyCourseAction,
  addMyLessonAction,
  updateMyLessonAction,
  deleteMyLessonAction,
  moveMyLessonAction,
  validateMyBunnyVideoAction,
  setMyMainImageAction,
  addMySecondaryImageAction,
  removeMySecondaryImageAction,
  moveMySecondaryImageAction,
} from '@/lib/teacher/studio-actions';

export const dynamic = 'force-dynamic';

const lessonActions: LessonActions = {
  addLesson: addMyLessonAction,
  updateLesson: updateMyLessonAction,
  deleteLesson: deleteMyLessonAction,
  moveLesson: moveMyLessonAction,
  validateBunnyVideo: validateMyBunnyVideoAction,
};

const imageActions: ImageActions = {
  setMain: setMyMainImageAction,
  addSecondary: addMySecondaryImageAction,
  removeSecondary: removeMySecondaryImageAction,
  moveSecondary: moveMySecondaryImageAction,
};

/**
 * /enseigner/studio/cours/[slug]/editer — the teacher studio's course
 * editor (Task C3-T4). Reuses the EXACT SAME CMS components the admin
 * `/admin/cours/[slug]/editer` page renders (`CourseEditor`,
 * `LessonsManager`, `ImagesManager`), wired to the owner-scoped actions in
 * lib/teacher/studio-actions.ts instead of the admin's
 * lib/admin/content-actions.ts — see those two files' header comments for
 * the dependency-injection shape that makes this possible with zero changes
 * to the admin CMS's own behaviour.
 *
 * Ownership is checked TWICE, independently: `getMyCourse` (read-side,
 * below — returns `null`, triggering `notFound()`, for a slug that isn't
 * owned by this teacher) and every studio-actions.ts mutation (write-side,
 * re-checked on every save regardless of what this page rendered).
 */
export default async function EditMyCoursePage({
  params: { locale, slug },
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
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

  // Ownership-checked read: `null` for a course that doesn't exist OR isn't
  // owned by `userId` — either way, 404, never someone else's content.
  const course = await getMyCourse(userId, slug);
  if (!course) notFound();

  // Real per-course sales count for CourseEditor's "impact revenue" copy
  // (the same figure the studio dashboard's CourseCard shows) — reuses
  // getMyCourses rather than a second bespoke query.
  const myCourses = await getMyCourses(userId);
  const salesCount = myCourses.find((c) => c.slug === slug)?.salesCount ?? 0;

  return (
    <Section>
      <Container className="max-w-[1180px]">
        <div className="space-y-4">
          <Link href="/enseigner/studio" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
            <IconArrowLeft size={14} /> {t('backToStudio')}
          </Link>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase text-ink/40">{course.code}</span>
            <h1 className="font-display text-xl font-bold text-ink">
              {(locale === 'ht' ? course.title_ht : course.title_fr || course.title_ht) || t('untitled')}
            </h1>
          </div>

          <StudioStatusBar slug={course.slug} status={course.rawStatus} reviewNote={course.reviewNote} />
          <CourseEditor course={course} salesCount={salesCount} priciest={null} updateAction={updateMyCourseAction} />
          <LessonsManager
            slug={course.slug}
            lessons={course.lessons}
            isDraft={course.rawStatus === 'draft' || course.rawStatus === 'rejected'}
            actions={lessonActions}
          />
          <ImagesManager slug={course.slug} mainImage={course.mainImage} secondary={course.secondaryImages} actions={imageActions} />
        </div>
      </Container>
    </Section>
  );
}
