import { setRequestLocale, getTranslations } from 'next-intl/server';
import { courses } from '@/data/courses';
import { listTestimonials } from '@/lib/admin/site/ops';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { TestimonialsCMS } from '@/components/admin/site/TestimonialsCMS';

export const dynamic = 'force-dynamic';

export default async function TestimonialsPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.read'))) return <Forbidden />;
  const t = await getTranslations('admin.testimonials');
  const items = listTestimonials();
  const catalog = courses.map((c) => ({ slug: c.slug, title: locale === 'ht' ? c.title_ht : c.title_fr }));

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>
      <TestimonialsCMS items={items} courses={catalog} />
    </div>
  );
}
