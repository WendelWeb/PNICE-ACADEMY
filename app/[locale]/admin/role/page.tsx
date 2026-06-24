import { auth, clerkClient } from '@clerk/nextjs/server';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconShieldLock, IconUsersGroup } from '@tabler/icons-react';
import { resolveAdminRole, primaryEmail } from '@/lib/admin/access';
import { isAdminRole, ADMIN_ROLES, type AdminRole } from '@/lib/admin/roles';
import { can, ALL_CAPABILITIES, capabilitiesOf } from '@/lib/admin/permissions';
import { AdminsManager, type AdminRow } from '@/components/admin/platform/AdminsManager';

export const dynamic = 'force-dynamic';

export default async function RolesPage({
  params: { locale },
}: {
  params: { locale: 'ht' | 'fr' };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('admin.access');
  const tr = await getTranslations('admin.roles');

  const { userId } = await auth();
  const client = await clerkClient();
  const me = userId ? await client.users.getUser(userId) : null;
  const myRole = me ? resolveAdminRole(me) : null;

  if (!myRole || !can(myRole, 'roles.manage')) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-ink/12 bg-paper-light p-8 text-center">
        <IconShieldLock size={28} className="mx-auto text-stampred" />
        <p className="mt-3 font-mono text-sm text-graphite/70">{t('forbidden')}</p>
      </div>
    );
  }

  const res = await client.users.getUserList({ limit: 100 });
  const list = Array.isArray(res) ? res : res.data;
  const admins: AdminRow[] = list
    .filter((u) => isAdminRole(u.publicMetadata?.role))
    .map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || '—',
      email: primaryEmail(u) ?? '—',
      role: u.publicMetadata.role as AdminRole,
      twoFA: u.twoFactorEnabled,
      lastSignInAt: u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null,
      suspended: u.publicMetadata?.adminSuspended === true,
      isSelf: u.id === userId,
    }));

  const roleLabels = Object.fromEntries(ADMIN_ROLES.map((r) => [r, tr(r)])) as Record<AdminRole, string>;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <AdminsManager admins={admins} roles={[...ADMIN_ROLES]} roleLabels={roleLabels} locale={locale} />

      {/* Permission matrix — what each role can read and do. */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconUsersGroup size={13} /> {t('matrix.title')}
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/12 text-left">
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">
                  {t('matrix.capability')}
                </th>
                {ADMIN_ROLES.map((r) => (
                  <th
                    key={r}
                    className="px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wide text-ink/55"
                  >
                    {roleLabels[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_CAPABILITIES.map((capKey) => (
                <tr key={capKey} className="border-b border-ink/8 last:border-0">
                  <td className="px-3 py-2 text-[13px] text-ink/85">{t(`caps.${capKey}`)}</td>
                  {ADMIN_ROLES.map((r) => {
                    const ok = capabilitiesOf(r).includes(capKey);
                    return (
                      <td key={r} className="px-3 py-2 text-center">
                        <span className={ok ? 'font-mono text-teal' : 'font-mono text-ink/25'}>
                          {ok ? '✓' : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[10px] text-ink/45">{t('matrix.legend')}</p>
      </section>
    </div>
  );
}
