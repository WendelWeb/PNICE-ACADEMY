'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import {
  IconLayoutDashboard,
  IconUsers,
  IconBook,
  IconRefresh,
  IconCreditCard,
  IconChartLine,
  IconStar,
  IconSpeakerphone,
  IconLifebuoy,
  IconShieldLock,
  IconSettings,
  IconMenu2,
  IconX,
  IconExternalLink,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import type { AdminRole } from '@/lib/admin/roles';
import { ADMIN_NAV } from './nav';
import { RoleBadge } from './ui';

const ICONS: Record<string, TablerIcon> = {
  overview: IconLayoutDashboard,
  users: IconUsers,
  courses: IconBook,
  subscriptions: IconRefresh,
  payments: IconCreditCard,
  progress: IconChartLine,
  testimonials: IconStar,
  marketing: IconSpeakerphone,
  support: IconLifebuoy,
  roles: IconShieldLock,
  settings: IconSettings,
};

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

export function AdminShell({
  role,
  children,
}: {
  role: AdminRole;
  children: React.ReactNode;
}) {
  const t = useTranslations('admin');
  const pathname = usePathname();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  const activeKey =
    ADMIN_NAV.find(
      (i) => i.href && (pathname === i.href || pathname.startsWith(i.href + '/')),
    )?.key ?? 'overview';

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink/12 bg-paper-light transition-transform duration-200 motion-reduce:transition-none',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label={t('a11y.sidebar')}
      >
        <div className="flex items-center justify-between gap-2 border-b border-ink/10 px-5 py-4">
          <span className="font-display text-base font-extrabold lowercase leading-none tracking-tight text-ink">
            pnice academy
          </span>
          <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-paper-light">
            {t('badge')}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn('ml-auto text-ink/60 hover:text-ink lg:hidden', focusRing)}
            aria-label={t('a11y.closeMenu')}
          >
            <IconX size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {ADMIN_NAV.map((item) => {
              const Icon = ICONS[item.icon] ?? IconLayoutDashboard;
              const isActive = item.key === activeKey && item.enabled;
              const label = t(`nav.${item.key}`);

              if (!item.enabled) {
                return (
                  <li key={item.key}>
                    <span
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink/35"
                      title={t('soon')}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className="truncate">{label}</span>
                      <span className="ml-auto rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink/35">
                        {t('soon')}
                      </span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.key}>
                  <Link
                    href={item.href!}
                    onClick={() => setOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors motion-reduce:transition-none',
                      focusRing,
                      isActive
                        ? 'bg-ochre/15 font-semibold text-ink'
                        : 'text-ink/75 hover:bg-ink/[0.04] hover:text-ink',
                    )}
                  >
                    <Icon size={18} className={cn('shrink-0', isActive && 'text-ochre')} />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-ink/10 px-3 py-3">
          <Link
            href="/"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink/60 hover:bg-ink/[0.04] hover:text-ink',
              focusRing,
            )}
          >
            <IconExternalLink size={15} className="shrink-0" />
            {t('viewSite')}
          </Link>
        </div>
      </aside>

      {/* Backdrop (mobile / tablet) */}
      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
        />
      )}

      {/* Content column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink/12 bg-paper-light/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn('text-ink/70 hover:text-ink lg:hidden', focusRing)}
            aria-label={t('a11y.openMenu')}
          >
            <IconMenu2 size={22} />
          </button>

          <h1 className="font-display text-lg font-bold leading-none text-ink">
            {t(`nav.${activeKey}`)}
          </h1>

          <div className="ml-auto flex items-center gap-3">
            <RoleBadge role={role} label={t(`roles.${role}`)} />
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-medium leading-tight text-ink">
                {user?.fullName || user?.primaryEmailAddress?.emailAddress || '—'}
              </span>
            </span>
            {user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full border border-ink/15 object-cover"
              />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/10 font-mono text-xs text-ink/60">
                {(user?.firstName?.[0] || 'A').toUpperCase()}
              </span>
            )}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
