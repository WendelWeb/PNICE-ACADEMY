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
import { computeCourseReadiness } from '@/lib/courses/readiness';
import { CourseEditor } from '@/components/admin/content/CourseEditor';
import { LessonsManager, type LessonActions } from '@/components/admin/content/LessonsManager';
import { ImagesManager, type ImageActions } from '@/components/admin/content/ImagesManager';
import { CourseResourcesPanel } from '@/components/admin/content/CourseResourcesPanel';
import { StudioStatusBar } from '@/components/teacher/studio/StudioStatusBar';
import { EditorTabs, type EditorTabKey } from '@/components/content/EditorTabs';
import {
  updateMyCourseAction,
  addMyLessonAction,
  updateMyLessonAction,
  deleteMyLessonAction,
  moveMyLessonAction,
  validateMyBunnyVideoAction,
  createMyVideoUploadAction,
  createMyChapterAction,
  updateMyChapterAction,
  deleteMyChapterAction,
  reorderMyChapterAction,
  moveMyLessonToChapterAction,
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
  createUpload: createMyVideoUploadAction,
  createChapter: createMyChapterAction,
  updateChapter: updateMyChapterAction,
  deleteChapter: deleteMyChapterAction,
  reorderChapter: reorderMyChapterAction,
  moveLessonToChapter: moveMyLessonToChapterAction,
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
const TAB_KEYS: EditorTabKey[] = ['infos', 'plan', 'medias', 'ressources'];

export default async function EditMyCoursePage({
  params: { locale, slug },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
  searchParams: { tab?: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('teach.studio');
  const tTabs = await getTranslations('admin.cms.tabs');

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

  // Task K2 — the readiness checklist, shared by StudioStatusBar's expandable
  // "N point(s) à compléter" disclosure (Task A2 folded the old standalone
  // CourseReadiness section into that sticky bar).
  const readinessItems = computeCourseReadiness(course);

  // Task A2 — tabs instead of one giant scroll: `?tab=` is server-read here
  // (shareable URL, no lost state on refresh) — see EditorTabs.tsx.
  const activeTab: EditorTabKey = TAB_KEYS.includes(searchParams.tab as EditorTabKey)
    ? (searchParams.tab as EditorTabKey)
    : 'infos';
  const basePath = `/enseigner/studio/cours/${slug}/editer`;
  const isDraft = course.rawStatus === 'draft' || course.rawStatus === 'rejected';

  return (
    <Section>
      <Container className="max-w-[1180px]">
        <div className="space-y-4 pb-2">
          <Link href="/enseigner/studio" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
            <IconArrowLeft size={14} /> {t('backToStudio')}
          </Link>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase text-ink/40">{course.code}</span>
            <h1 className="font-display text-xl font-bold text-ink">
              {(locale === 'ht' ? course.title_ht : course.title_fr || course.title_ht) || t('untitled')}
            </h1>
          </div>

          <EditorTabs
            basePath={basePath}
            active={activeTab}
            tabs={[
              { key: 'infos', label: tTabs('infos') },
              { key: 'plan', label: tTabs('plan') },
              { key: 'medias', label: tTabs('medias') },
              { key: 'ressources', label: tTabs('ressources') },
            ]}
          />

          {activeTab === 'infos' && (
            <CourseEditor course={course} salesCount={salesCount} priciest={null} updateAction={updateMyCourseAction} />
          )}
          {activeTab === 'plan' && (
            <LessonsManager
              slug={course.slug}
              lessons={course.lessons}
              chapters={course.chapters}
              isDraft={isDraft}
              bilingual={course.bilingual}
              primaryLocale={course.primary_locale}
              actions={lessonActions}
            />
          )}
          {activeTab === 'medias' && (
            <ImagesManager slug={course.slug} mainImage={course.mainImage} secondary={course.secondaryImages} actions={imageActions} />
          )}
          {activeTab === 'ressources' && (
            <CourseResourcesPanel slug={course.slug} resources={course.resources} updateAction={updateMyCourseAction} />
          )}

          <StudioStatusBar
            slug={course.slug}
            status={course.rawStatus}
            reviewNote={course.reviewNote}
            readinessItems={readinessItems}
          />
        </div>
      </Container>
    </Section>
  );
}
