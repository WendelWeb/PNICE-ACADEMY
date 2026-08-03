import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { Section, Container } from '@/components/ui/Section';
import { clerkEnabled } from '@/lib/clerk';
import { bunnyStorageConfigured } from '@/lib/bunny/storage';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { isApprovedTeacher } from '@/lib/teacher/profile';
import { getMyCourse, getMyCourses } from '@/lib/teacher/studio';
import { computeCourseReadiness, countMissingReadiness } from '@/lib/courses/readiness';
import { computeReadinessAnchors, EDITOR_STEPS, type EditorStepKey } from '@/lib/courses/readiness-anchors';
import { CourseEditor } from '@/components/admin/content/CourseEditor';
import { LessonsManager, type LessonActions } from '@/components/admin/content/LessonsManager';
import { ImagesManager, type ImageActions } from '@/components/admin/content/ImagesManager';
import { CourseResourcesPanel } from '@/components/admin/content/CourseResourcesPanel';
import { BordereauHeader } from '@/components/teacher/studio/BordereauHeader';
import { ControlRail } from '@/components/teacher/studio/ControlRail';
import { EditorStepHeading } from '@/components/teacher/studio/EditorStepHeading';
import { MobileStepBar } from '@/components/teacher/studio/MobileStepBar';
import { QuickActions } from '@/components/teacher/studio/QuickActions';
import { STEP_ICONS } from '@/components/teacher/studio/steps';
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
  submitMyCourseForReviewAction,
  unpublishMyCourseAction,
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
 * editor (Task C3-T4), rebuilt as "le bordereau" (Task D1 — the authoring
 * masterpiece): a sticky `BordereauHeader` (code, title, status, the
 * publish/submit action), a PERMANENT `ControlRail` checklist (the 8
 * readiness items grouped under the 4 numbered steps, each unmet item
 * clickable straight to the field), and the active step's content — still
 * the EXACT SAME CMS components the admin CMS used to render
 * (`CourseEditor`, `LessonsManager`, `ImagesManager`, `CourseResourcesPanel`)
 * with their CURRENT props, wired to the owner-scoped actions in
 * lib/teacher/studio-actions.ts — this task restructures the shell around
 * them, not the fields themselves (see lib/courses/readiness-anchors.ts's
 * doc comment for how a checklist click finds its way to a specific field).
 *
 * Ownership is checked TWICE, independently: `getMyCourse` (read-side,
 * below — returns `null`, triggering `notFound()`, for a slug that isn't
 * owned by this teacher) and every studio-actions.ts mutation (write-side,
 * re-checked on every save regardless of what this page rendered).
 */
const TAB_KEYS: EditorStepKey[] = ['infos', 'plan', 'medias', 'ressources'];

export default async function EditMyCoursePage({
  params: { locale, slug },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
  searchParams: { tab?: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('teach.studio');
  const tEditor = await getTranslations('teach.studio.editor');

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

  // Task K2 — the readiness checklist. Task D1 folds it into the permanent
  // `ControlRail` (the old `StudioStatusBar`'s collapsible disclosure is
  // gone) and adds `computeReadinessAnchors` so each unmet item knows
  // exactly which step + field to jump to.
  const readinessItems = computeCourseReadiness(course);
  const readinessMissing = countMissingReadiness(readinessItems);
  const anchors = computeReadinessAnchors(course);

  // Task A2 — tabs instead of one giant scroll: `?tab=` is server-read here
  // (shareable URL, no lost state on refresh) — see ControlRail.tsx. Task D1
  // keeps this EXACT contract, just presents the 4 tab keys as ① → ④.
  const activeTab: EditorStepKey = TAB_KEYS.includes(searchParams.tab as EditorStepKey)
    ? (searchParams.tab as EditorStepKey)
    : 'infos';
  const activeStepNumber = EDITOR_STEPS.find((s) => s.key === activeTab)?.number ?? 1;
  const basePath = `/enseigner/studio/cours/${slug}/editer`;
  const isDraft = course.rawStatus === 'draft' || course.rawStatus === 'rejected';
  const title = (locale === 'ht' ? course.title_ht : course.title_fr || course.title_ht) || t('untitled');

  // Stage 1 — "Ki sa w vle fè?" quick-action targets, resolved server-side:
  // the video shortcut opens the first lesson still MISSING a video (falling
  // back to the first lesson, then to the add-lesson button on an empty
  // plan); the document shortcut opens the first lesson's resources section.
  // Anchors are the Stage 1 sub-anchors LessonEditPanel renders.
  const firstLessonNoVideo = course.lessons.find((l) => !l.bunnyVideoId) ?? course.lessons[0];
  const quickVideoAnchor = firstLessonNoVideo ? `lesson-${firstLessonNoVideo.id}-video` : 'plan-add-lesson';
  const quickResourcesAnchor = course.lessons[0] ? `lesson-${course.lessons[0].id}-resources` : 'plan-add-lesson';

  return (
    <Section>
      <Container className="max-w-[1180px]">
        <div className="space-y-4 pb-10">
          <BordereauHeader
            slug={course.slug}
            code={course.code}
            title={title}
            status={course.rawStatus}
            reviewNote={course.reviewNote}
            missing={readinessMissing}
            submitAction={submitMyCourseForReviewAction}
            unpublishAction={unpublishMyCourseAction}
          >
            {/* Stage 1 — the phone-first step bar: the 4 steps always visible
                (<lg), navigating on the same frozen ?tab= URLs the rail uses.
                Slotted INSIDE the sticky header (review fix) so it genuinely
                stays on screen while a long plan scrolls. */}
            <MobileStepBar activeTab={activeTab} basePath={basePath} />
          </BordereauHeader>

          <div className="grid gap-4 pt-2 lg:grid-cols-[280px_1fr] lg:items-start lg:gap-6">
            <ControlRail items={readinessItems} anchors={anchors} activeTab={activeTab} basePath={basePath} />

            <div className="min-w-0 space-y-4">
              <QuickActions
                basePath={basePath}
                activeTab={activeTab}
                videoAnchor={quickVideoAnchor}
                resourcesAnchor={quickResourcesAnchor}
              />

              <EditorStepHeading
                number={activeStepNumber}
                title={tEditor(`steps.${activeTab}.title`)}
                intent={tEditor(`steps.${activeTab}.intent`)}
                icon={STEP_ICONS[activeTab]}
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
                  uploadEnabled={bunnyStorageConfigured()}
                  actions={lessonActions}
                />
              )}
              {activeTab === 'medias' && (
                <ImagesManager
                  slug={course.slug}
                  mainImage={course.mainImage}
                  secondary={course.secondaryImages}
                  actions={imageActions}
                  courseTitle={title}
                  uploadEnabled={bunnyStorageConfigured()}
                />
              )}
              {activeTab === 'ressources' && (
                <CourseResourcesPanel
                  slug={course.slug}
                  resources={course.resources}
                  updateAction={updateMyCourseAction}
                  bilingual={course.bilingual}
                  primaryLocale={course.primary_locale}
                  uploadEnabled={bunnyStorageConfigured()}
                />
              )}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
