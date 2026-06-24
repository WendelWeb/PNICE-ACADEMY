import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import { getAuditLog } from '@/lib/admin/data';
import type { AuditAction, AuditLogQuery } from '@/lib/admin/data';
import { fmtDateTime } from '@/lib/admin/format';
import { paramsOf, type RawSearchParams } from '@/lib/admin/users-query';
import { Forbidden } from '@/components/admin/Forbidden';
import { Pagination } from '@/components/admin/users/Pagination';
import { AuditFilters } from '@/components/admin/audit/AuditFilters';

export const dynamic = 'force-dynamic';

function parse(sp: RawSearchParams): AuditLogQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q: AuditLogQuery = {};
  const admin = one(sp.admin); if (admin) q.admin = admin;
  const action = one(sp.action); if (action) q.action = action as AuditAction;
  const from = one(sp.from); if (from) q.from = from;
  const to = one(sp.to); if (to) q.to = to;
  const page = Number(one(sp.page)); if (Number.isInteger(page) && page > 0) q.page = page;
  return q;
}

export default async function AuditPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  const { userId } = await auth();
  const client = await clerkClient();
  const me = userId ? await client.users.getUser(userId) : null;
  const role = me ? resolveAdminRole(me) : null;
  if (!role || !can(role, 'roles.manage')) return <Forbidden />;

  const t = await getTranslations('admin.audit');
  const data = await getAuditLog(parse(searchParams));
  const qs = paramsOf(searchParams).toString();
  const exportHref = `/${locale}/admin/audit/export${qs ? `?${qs}` : ''}`;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div>
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <p className="mt-1 font-mono text-[10px] text-ink/45">{t('readonly')}</p>
      </div>
      <AuditFilters admins={data.admins} exportHref={exportHref} />

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">{t('empty')}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                <th className="px-3 py-2">{t('col.when')}</th>
                <th className="px-3 py-2">{t('col.admin')}</th>
                <th className="px-3 py-2">{t('col.action')}</th>
                <th className="px-3 py-2">{t('col.target')}</th>
                <th className="px-3 py-2">{t('col.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.id} className="border-b border-ink/8 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink/60 tabular-nums">{fmtDateTime(a.createdAt, locale)}</td>
                  <td className="px-3 py-2 text-[13px] text-ink/85">{a.adminName}</td>
                  <td className="px-3 py-2"><span className="rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/70">{t(`action.${a.action}`)}</span></td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink/55">{a.targetUserId || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink/55">
                    {a.detail || '—'}{a.reason ? <span className="block italic text-graphite/60">“{a.reason}”</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination total={data.total} page={data.page} pageSize={data.pageSize} searchParams={searchParams} base="/admin/audit" />
    </div>
  );
}
