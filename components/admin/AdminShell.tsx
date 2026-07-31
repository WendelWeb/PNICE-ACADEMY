'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import {
  IconMenu2,
  IconX,
  IconExternalLink,
  IconTool,
  IconLayoutGrid,
} from '@tabler/icons-react';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import type { AdminRole } from '@/lib/admin/roles';
import { can } from '@/lib/admin/permissions';
import { visibleSections, firstReachableHref, ADMIN_NAV_ICONS } from './nav';
import { RoleBadge } from './ui';
import { NotificationBell } from './support/NotificationBell';
import { SupportNavBadge } from './support/SupportNavBadge';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

export function AdminShell({
  role,
  maintenance,
  children,
}: {
  role: AdminRole;
  maintenance?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations('admin');
  const tm = useTranslations('admin.platform.maintenance');
  const pathname = usePathname();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);

  // Hide items the role can't reach, then hide a whole group header when the
  // role can see none of its items (Task A1 — grouped nav, zero cap changes).
  // Shared with SpacesHub via nav.ts's `visibleSections` so the sidebar and
  // the dashboard access cards can never disagree about what a role can reach.
  const sections = visibleSections(role);

  const nav = sections.flatMap((s) => s.items);

  const activeKey =
    nav.find((i) => i.href && (pathname === i.href || pathname.startsWith(i.href + '/')))?.key ??
    'overview';

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
          {sections.map((section, sectionIndex) => (
            <div key={section.key} className={cn(sectionIndex > 0 && 'mt-4')}>
              <p className="px-3 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                {t(`nav.sections.${section.key}`)}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = ADMIN_NAV_ICONS[item.icon] ?? ADMIN_NAV_ICONS.overview;
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
                        {item.key === 'support' && <SupportNavBadge />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
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
        {maintenance && (
          <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-stampred px-4 py-1.5 text-center font-mono text-[11px] font-medium text-paper-light">
            <IconTool size={13} className="shrink-0" /> {tm('adminBanner')}
          </div>
        )}
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
            {/* Task A2 — "Espaces" switcher: reach any admin section's first
                page from anywhere, not just the dashboard hub. Reuses the same
                role-filtered `sections` the sidebar renders, so it never shows
                a space the sidebar wouldn't. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSpacesOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={spacesOpen}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border border-ink/12 px-2.5 py-1.5 text-xs font-medium text-ink/70 transition-colors motion-reduce:transition-none hover:border-ochre/40 hover:text-ink',
                  focusRing,
                )}
              >
                <IconLayoutGrid size={16} className="shrink-0" />
                <span className="hidden sm:inline">{t('hub.headerTrigger')}</span>
              </button>
              {spacesOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setSpacesOpen(false)}
                    className="fixed inset-0 z-30"
                  />
                  <div
                    role="menu"
                    aria-label={t('hub.headerTrigger')}
                    className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-ink/12 bg-paper-light p-1.5 shadow-lg"
                  >
                    {sections.map((section) => {
                      const href = firstReachableHref(section);
                      if (!href) return null;
                      const SectionIcon = ADMIN_NAV_ICONS[section.icon] ?? ADMIN_NAV_ICONS.overview;
                      return (
                        <Link
                          key={section.key}
                          href={href}
                          role="menuitem"
                          onClick={() => setSpacesOpen(false)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink/75 transition-colors motion-reduce:transition-none hover:bg-ink/[0.04] hover:text-ink',
                            focusRing,
                          )}
                        >
                          <SectionIcon size={16} className="shrink-0 text-ink/45" />
                          <span className="truncate">{t(`nav.sections.${section.key}`)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {can(role, 'support.read') && <NotificationBell />}
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
