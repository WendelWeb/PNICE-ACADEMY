import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { CreatePromoForm } from '@/components/admin/marketing/CreatePromoForm';
import { Link } from '@/i18n/routing';
import { courses } from '@/data/courses';

export const dynamic = 'force-dynamic';

export default async function NewPromoPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing.promos');

  const catalog = courses.map((c) => ({ slug: c.slug, title: locale === 'ht' ? c.title_ht : c.title_fr }));

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />
      <Link
        href="/admin/marketing/promos"
        className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink"
      >
        <IconArrowLeft size={14} /> {t('backToList')}
      </Link>
      <div className="max-w-2xl">
        <CreatePromoForm courses={catalog} />
      </div>
    </div>
  );
}
