import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getUsers } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { AnnouncementComposer } from '@/components/admin/site/AnnouncementComposer';

export const dynamic = 'force-dynamic';

export default async function MarketingPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing');

  const [all, sub, oneOff, free] = await Promise.all([
    getUsers({ pageSize: 1 }),
    getUsers({ type: 'active_subscriber', pageSize: 1 }),
    getUsers({ type: 'one_off', pageSize: 1 }),
    getUsers({ type: 'free', pageSize: 1 }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>
      <AnnouncementComposer
        counts={{ all: all.total, active_subscriber: sub.total, one_off: oneOff.total, free: free.total }}
      />
    </div>
  );
}
