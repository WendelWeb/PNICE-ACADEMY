import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { getAdminCourse, getAdminCourses } from '@/lib/courses/write';
import { getCourseSales } from '@/lib/admin/data';
import { computeCourseReadiness, countMissingReadiness } from '@/lib/courses/readiness';
import { Link } from '@/i18n/routing';
import { Forbidden } from '@/components/admin/Forbidden';
import { CourseEditor } from '@/components/admin/content/CourseEditor';
import { LessonsManager } from '@/components/admin/content/LessonsManager';
import { ImagesManager } from '@/components/admin/content/ImagesManager';
import { PublishBar } from '@/components/admin/content/PublishBar';
import { CourseReadiness } from '@/components/content/CourseReadiness';

export const dynamic = 'force-dynamic';

export default async function EditCoursePage({
  params: { locale, slug },
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.edit'))) return <Forbidden />;
  const t = await getTranslations('admin.cms');
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

  // Task K2 — the readiness checklist, computed once and shared by
  // CourseReadiness (the list) and PublishBar (the "N point(s) à compléter"
  // badge next to the Publish button).
  const readinessItems = computeCourseReadiness(course);
  const readinessMissing = countMissingReadiness(readinessItems);

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <Link href="/admin/cours" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {t('editor.back')}
      </Link>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase text-ink/40">{course.code}</span>
        <h1 className="font-display text-xl font-bold text-ink">
          {locale === 'ht' ? course.title_ht : course.title_fr || course.title_ht || t('editor.untitled')}
        </h1>
      </div>

      <CourseReadiness items={readinessItems} />
      <PublishBar
        slug={course.slug}
        code={course.code}
        status={course.status}
        hasUnpublishedChanges={course.hasUnpublishedChanges}
        reviewNote={course.reviewNote}
        canModerate={canModerate}
        readinessMissing={readinessMissing}
      />
      <CourseEditor course={course} salesCount={salesCount} priciest={priciest ? { code: priciest.code, priceCents: priciest.priceCents } : null} />
      <LessonsManager slug={course.slug} lessons={course.lessons} chapters={course.chapters} isDraft={course.status === 'draft'} />
      <ImagesManager slug={course.slug} mainImage={course.mainImage} secondary={course.secondaryImages} />
    </div>
  );
}
