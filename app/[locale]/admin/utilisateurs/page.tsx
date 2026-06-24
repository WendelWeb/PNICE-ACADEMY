import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getUsers } from '@/lib/admin/data';
import { parseUsersQuery, spToParams, type RawSearchParams } from '@/lib/admin/users-query';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { SegmentTabs } from '@/components/admin/users/SegmentTabs';
import { UsersControls } from '@/components/admin/users/UsersControls';
import { UsersTable } from '@/components/admin/users/UsersTable';
import { Pagination } from '@/components/admin/users/Pagination';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('users.read'))) return <Forbidden />;

  const t = await getTranslations('admin.users');

  const query = parseUsersQuery(searchParams);
  const data = await getUsers(query);

  const qs = spToParams(searchParams).toString();
  const exportHref = `/${locale}/admin/utilisateurs/export${qs ? `?${qs}` : ''}`;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div>
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
      </div>

      <SegmentTabs counts={{ all: data.segmentCounts.all, ...data.segmentCounts.byType }} />
      <UsersControls exportHref={exportHref} />
      <UsersTable rows={data.rows} searchParams={searchParams} locale={locale} />
      <Pagination
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        searchParams={searchParams}
      />
    </div>
  );
}
