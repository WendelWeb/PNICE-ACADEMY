/**
 * Admin sidebar sections. `enabled: false` sections are shown (disabled) but
 * built in later lots. `cap`, when set, hides the item from roles that lack the
 * capability. Labels resolve via `admin.nav.<key>`; icons via the AdminShell map.
 *
 * Task A1 (2026-07-30 admin restructure): the sidebar used to be one flat list
 * of 20 items — grouped here into sections so "platform steering" and "daily
 * course work" read as two distinct spaces, per the owner's ask. Every item
 * keeps its exact original href/icon/cap (zero permission changes) — only the
 * grouping is new, plus one new item (`siteContent`, /admin/contenu) that
 * replaces the old `settings` item (/admin/parametres, now a redirect — see
 * that page). Section labels resolve via `admin.nav.sections.<key>`.
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

export type AdminNavSection = {
  key: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    key: 'pilotage',
    items: [
      { key: 'overview', href: '/admin', icon: 'overview', enabled: true, cap: 'overview.read' },
      { key: 'analytics', href: '/admin/analytics', icon: 'progress', enabled: true, cap: 'transactions.read' },
    ],
  },
  {
    key: 'content',
    items: [
      { key: 'courses', href: '/admin/cours', icon: 'courses', enabled: true, cap: 'courses.read' },
      { key: 'engagement', href: '/admin/engagement', icon: 'engagement', enabled: true, cap: 'courses.read' },
      { key: 'certificates', href: '/admin/certificats', icon: 'certificates', enabled: true, cap: 'courses.read' },
      { key: 'testimonials', href: '/admin/temoignages', icon: 'testimonials', enabled: true, cap: 'courses.read' },
      // NEW (Task A1) — moved out of /admin/parametres, which was a mix of
      // "site content" and "business settings". This is the site-content half.
      { key: 'siteContent', href: '/admin/contenu', icon: 'siteContent', enabled: true, cap: 'courses.edit' },
    ],
  },
  {
    key: 'teachers',
    items: [
      { key: 'teachers', href: '/admin/enseignants', icon: 'teachers', enabled: true, cap: 'teachers.review' },
      { key: 'payouts', href: '/admin/retraits', icon: 'payouts', enabled: true, cap: 'payouts.process' },
    ],
  },
  {
    key: 'people',
    items: [
      { key: 'users', href: '/admin/utilisateurs', icon: 'users', enabled: true, cap: 'users.read' },
      { key: 'support', href: '/admin/support', icon: 'support', enabled: true, cap: 'support.read' },
    ],
  },
  {
    key: 'money',
    items: [
      { key: 'payments', href: '/admin/transactions', icon: 'payments', enabled: true, cap: 'transactions.read' },
      { key: 'subscriptions', href: '/admin/abonnements', icon: 'subscriptions', enabled: true, cap: 'transactions.read' },
      { key: 'marketing', href: '/admin/marketing', icon: 'marketing', enabled: true, cap: 'users.act' },
    ],
  },
  {
    key: 'platform',
    items: [
      // The business-settings half of the old /admin/parametres now lives
      // here (ReferralCreditPanel, DigestPanel) alongside the panels that
      // were already on this page (Providers, Maintenance, Subscription price).
      { key: 'platform', href: '/admin/plateforme', icon: 'platform', enabled: true, cap: 'roles.manage' },
      // Task fix/fx-rate-unify: the FX rate had its own edit form buried inside
      // /admin/plateforme (and a read-only link from /admin/transactions) — the
      // owner asked for a dedicated, obvious page. Same cap as 'platform'
      // (roles.manage ⇒ super-admin only in lib/admin/permissions's matrix): the
      // rate is platform-owner-level, not a regular admin setting.
      { key: 'taux', href: '/admin/taux', icon: 'taux', enabled: true, cap: 'roles.manage' },
      { key: 'roles', href: '/admin/role', icon: 'roles', enabled: true, cap: 'roles.manage' },
      { key: 'audit', href: '/admin/audit', icon: 'audit', enabled: true, cap: 'roles.manage' },
      { key: 'health', href: '/admin/sante', icon: 'health', enabled: true, cap: 'support.read' },
    ],
  },
];

/** Flat view, in case anything needs the plain list (e.g. active-item lookup). */
export const ADMIN_NAV: AdminNavItem[] = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
