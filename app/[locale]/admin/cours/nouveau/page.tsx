import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { nextCode } from '@/lib/admin/content/store';
import { Link } from '@/i18n/routing';
import { Forbidden } from '@/components/admin/Forbidden';
import { CreateCourseForm } from '@/components/admin/content/CreateCourseForm';

export const dynamic = 'force-dynamic';

export default async function NewCoursePage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.edit'))) return <Forbidden />;
  const t = await getTranslations('admin.cms.create');

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <Link href="/admin/cours" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {t('back')}
      </Link>
      <h1 className="font-display text-xl font-bold text-ink">{t('title')}</h1>
      <CreateCourseForm suggestedCode={nextCode()} />
    </div>
  );
}
