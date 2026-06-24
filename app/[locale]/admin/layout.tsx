import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { clerkEnabled } from '@/lib/clerk';
import { resolveAdminRole, isBootstrapAdmin, admin2faRequired } from '@/lib/admin/access';
import { isMaintenance } from '@/lib/admin/platform/store';
import { AdminShell } from '@/components/admin/AdminShell';
import { Require2FA } from '@/components/admin/Require2FA';

// Auth + role + 2FA are evaluated per request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — PNICE Academy',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);

  // Without Clerk keys we can't determine a role — show a plain notice.
  if (!clerkEnabled) {
    const t = await getTranslations('admin');
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-4 text-center">
        <p className="max-w-sm font-mono text-sm text-graphite/70">{t('clerkRequired')}</p>
      </div>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  // Authoritative check via the Backend API (works even if the middleware
  // fast-path session claim isn't configured): role must be an admin role and
  // 2FA must be enabled.
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const role = resolveAdminRole(user);
  if (!role) {
    redirect(`/${locale}`);
  }

  // Make a bootstrap grant sticky: persist the role so the ADMIN_BOOTSTRAP_EMAILS
  // env can be removed afterwards and the middleware fast-path/claims work.
  if (isBootstrapAdmin(user)) {
    try {
      await client.users.updateUserMetadata(userId, { publicMetadata: { role } });
    } catch {
      // Best-effort; access still works this request via the resolver.
    }
  }

  if (admin2faRequired() && !user.twoFactorEnabled) {
    return <Require2FA />;
  }

  return (
    <AdminShell role={role} maintenance={isMaintenance()}>
      {children}
    </AdminShell>
  );
}
