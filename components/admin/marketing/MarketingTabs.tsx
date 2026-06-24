'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/cn';

const TABS = [
  { key: 'announcements', href: '/admin/marketing' },
  { key: 'promos', href: '/admin/marketing/promos' },
  { key: 'attribution', href: '/admin/marketing/attribution' },
  { key: 'carts', href: '/admin/marketing/paniers' },
  { key: 'referrals', href: '/admin/marketing/parrainage' },
] as const;

export function MarketingTabs() {
  const t = useTranslations('admin.marketing.tabs');
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/admin/marketing'
      ? pathname === '/admin/marketing'
      : pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="flex flex-wrap gap-1 border-b border-ink/12" aria-label="Marketing">
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wide transition-colors motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre',
              active
                ? 'border-ochre font-semibold text-ink'
                : 'border-transparent text-ink/55 hover:text-ink',
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
