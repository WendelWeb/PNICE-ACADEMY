/**
 * Admin sidebar sections. `enabled: false` sections are shown (disabled) but
 * built in later lots. `cap`, when set, hides the item from roles that lack the
 * capability. Labels resolve via `admin.nav.<key>`; icons via the AdminShell map.
 */
import type { Capability } from '@/lib/admin/permissions';

export type AdminNavItem = {
  key: string;
  /** Locale-relative href (next-intl Link). Omitted for disabled items. */
  href?: string;
  icon: string;
  enabled: boolean;
  /** Required capability to even see the item. */
  cap?: Capability;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { key: 'overview', href: '/admin', icon: 'overview', enabled: true, cap: 'overview.read' },
  { key: 'users', href: '/admin/utilisateurs', icon: 'users', enabled: true, cap: 'users.read' },
  { key: 'courses', href: '/admin/cours', icon: 'courses', enabled: true, cap: 'courses.read' },
  { key: 'subscriptions', href: '/admin/abonnements', icon: 'subscriptions', enabled: true, cap: 'transactions.read' },
  { key: 'payments', href: '/admin/transactions', icon: 'payments', enabled: true, cap: 'transactions.read' },
  { key: 'analytics', href: '/admin/analytics', icon: 'progress', enabled: true, cap: 'transactions.read' },
  { key: 'engagement', href: '/admin/engagement', icon: 'engagement', enabled: true, cap: 'courses.read' },
  { key: 'certificates', href: '/admin/certificats', icon: 'certificates', enabled: true, cap: 'courses.read' },
  { key: 'testimonials', href: '/admin/temoignages', icon: 'testimonials', enabled: true, cap: 'courses.read' },
  { key: 'marketing', href: '/admin/marketing', icon: 'marketing', enabled: true, cap: 'users.act' },
  { key: 'support', href: '/admin/support', icon: 'support', enabled: true, cap: 'support.read' },
  { key: 'health', href: '/admin/sante', icon: 'health', enabled: true, cap: 'support.read' },
  { key: 'roles', href: '/admin/role', icon: 'roles', enabled: true, cap: 'roles.manage' },
  { key: 'audit', href: '/admin/audit', icon: 'audit', enabled: true, cap: 'roles.manage' },
  { key: 'settings', href: '/admin/parametres', icon: 'settings', enabled: true, cap: 'courses.edit' },
  { key: 'platform', href: '/admin/plateforme', icon: 'platform', enabled: true, cap: 'roles.manage' },
];
