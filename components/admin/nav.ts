/**
 * Admin sidebar sections. `enabled: false` sections are shown but disabled
 * (built in later lots). Labels are resolved via the `admin.nav.<key>`
 * translation key; icons via the map in AdminShell.
 */
export type AdminNavItem = {
  key: string;
  /** Locale-relative href (next-intl Link). Omitted for disabled items. */
  href?: string;
  icon: string;
  enabled: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { key: 'overview', href: '/admin', icon: 'overview', enabled: true },
  { key: 'users', icon: 'users', enabled: false },
  { key: 'courses', icon: 'courses', enabled: false },
  { key: 'subscriptions', icon: 'subscriptions', enabled: false },
  { key: 'payments', icon: 'payments', enabled: false },
  { key: 'progress', icon: 'progress', enabled: false },
  { key: 'testimonials', icon: 'testimonials', enabled: false },
  { key: 'marketing', icon: 'marketing', enabled: false },
  { key: 'support', icon: 'support', enabled: false },
  { key: 'roles', icon: 'roles', enabled: false },
  { key: 'settings', icon: 'settings', enabled: false },
];
