import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { getAdminCourse, getAdminCourses } from '@/lib/courses/write';
import { getCourseSales } from '@/lib/admin/data';
import { computeCourseReadiness } from '@/lib/courses/readiness';
import { Link } from '@/i18n/routing';
import { Forbidden } from '@/components/admin/Forbidden';
import { CourseEditor } from '@/components/admin/content/CourseEditor';
import { LessonsManager } from '@/components/admin/content/LessonsManager';
import { ImagesManager } from '@/components/admin/content/ImagesManager';
import { CourseResourcesPanel } from '@/components/admin/content/CourseResourcesPanel';
import { PublishBar } from '@/components/admin/content/PublishBar';
import { EditorTabs, type EditorTabKey } from '@/components/content/EditorTabs';

export const dynamic = 'force-dynamic';

const TAB_KEYS: EditorTabKey[] = ['infos', 'plan', 'medias', 'ressources'];

export default async function EditCoursePage({
  params: { locale, slug },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
  searchParams: { tab?: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.edit'))) return <Forbidden />;
  const t = await getTranslations('admin.cms');
  const tTabs = await getTranslations('admin.cms.tabs');
  // Task C3 fix: publish/unpublish/delete are teachers.review-gated now —
  // PublishBar hides those buttons for an editeur-contenu (courses.edit
  // only), who can still edit draft content below.
  const canModerate = await hasCap('teachers.review');

  const course = await getAdminCourse(slug);
  if (!course) notFound();

  const [sales, allCourses] = await Promise.all([getCourseSales(), getAdminCourses()]);
  const salesCount = sales.find((s) => s.slug === slug)?.enrollments ?? 0;
  const others = allCourses.filter((c) => c.slug !== slug);
  const priciest = others.length
    ? others.reduce((a, b) => (b.priceCents > a.priceCents ? b : a))
    : null;

  // Task K2 — the readiness checklist, shared by PublishBar's expandable
  // "N point(s) à compléter" disclosure (Task A2 folded the old standalone
  // CourseReadiness section into that sticky bar).
  const readinessItems = computeCourseReadiness(course);

  // Task A2 — tabs instead of one giant scroll: `?tab=` is server-read here
  // (shareable URL, no lost state on refresh) — see EditorTabs.tsx.
  const activeTab: EditorTabKey = TAB_KEYS.includes(searchParams.tab as EditorTabKey)
    ? (searchParams.tab as EditorTabKey)
    : 'infos';
  const basePath = `/admin/cours/${slug}/editer`;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4 pb-2">
      <Link href="/admin/cours" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {t('editor.back')}
      </Link>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase text-ink/40">{course.code}</span>
        <h1 className="font-display text-xl font-bold text-ink">
          {locale === 'ht' ? course.title_ht : course.title_fr || course.title_ht || t('editor.untitled')}
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
        <CourseEditor
          course={course}
          salesCount={salesCount}
          priciest={priciest ? { code: priciest.code, priceCents: priciest.priceCents } : null}
        />
      )}
      {activeTab === 'plan' && (
        <LessonsManager slug={course.slug} lessons={course.lessons} chapters={course.chapters} isDraft={course.status === 'draft'} />
      )}
      {activeTab === 'medias' && (
        <ImagesManager slug={course.slug} mainImage={course.mainImage} secondary={course.secondaryImages} />
      )}
      {activeTab === 'ressources' && <CourseResourcesPanel slug={course.slug} resources={course.resources} />}

      <PublishBar
        slug={course.slug}
        code={course.code}
        status={course.status}
        hasUnpublishedChanges={course.hasUnpublishedChanges}
        reviewNote={course.reviewNote}
        canModerate={canModerate}
        readinessItems={readinessItems}
      />
    </div>
  );
}
