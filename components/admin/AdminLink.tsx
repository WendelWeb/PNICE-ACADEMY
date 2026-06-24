'use client';

import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { isAdminRole } from '@/lib/admin/roles';

/**
 * Discreet "Admin" entry in the public nav, shown only once a user actually has
 * an admin role persisted in publicMetadata (after the first /admin visit, or
 * after being granted via /admin/role). The first bootstrap entry is by URL.
 */
export function AdminLink() {
  const { isLoaded, user } = useUser();
  const t = useTranslations('admin');

  if (!isLoaded || !user) return null;
  if (!isAdminRole(user.publicMetadata?.role)) return null;

  return (
    <Link
      href="/admin"
      className="inline-flex items-center gap-1 rounded bg-ink/[0.06] px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
    >
      <IconLayoutDashboard size={14} />
      {t('badge')}
    </Link>
  );
}
