import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft } from '@tabler/icons-react';
import { getTemplates } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { TemplatesManager } from '@/components/admin/support/TemplatesManager';
import { Link } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('support.act'))) return <Forbidden />;
  const t = await getTranslations('admin.support');
  const templates = await getTemplates();

  return (
    <div className="mx-auto max-w-[920px] space-y-4">
      <Link href="/admin/support" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {t('detail.back')}
      </Link>
      <p className="text-sm text-graphite/70">{t('templates.subtitle')}</p>
      <TemplatesManager templates={templates} />
    </div>
  );
}
