/**
 * Admin sidebar sections. `enabled: false` sections are shown (disabled) but
 * built in later lots. `cap`, when set, hides the item from roles that lack the
 * capability. Labels resolve via `admin.nav.<key>`; icons via `ADMIN_NAV_ICONS`.
 *
 * Task A1 (2026-07-30 admin restructure): the sidebar used to be one flat list
 * of 20 items — grouped here into sections so "platform steering" and "daily
 * course work" read as two distinct spaces, per the owner's ask. Every item
 * keeps its exact original href/icon/cap (zero permission changes) — only the
 * grouping is new, plus one new item (`siteContent`, /admin/contenu) that
 * replaces the old `settings` item (/admin/parametres, now a redirect — see
 * that page). Section labels resolve via `admin.nav.sections.<key>`.
 *
 * Task A2 (admin spaces hub): the owner asked for obvious ACCESS BUTTONS into
 * each space, not just a sidebar (AdminShell) and a KPI-only dashboard
 * (SpacesHub, app/[locale]/admin/page.tsx). Both need the exact same
 * role-filtered view of these sections, so the filtering logic (`visibleSections`)
 * and the icon map (`ADMIN_NAV_ICONS`) live HERE, single-sourced, instead of
 * being duplicated in AdminShell — the sidebar and the hub literally cannot
 * drift apart because they call the same function.
 */
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
  IconActivity,
  IconCertificate,
  IconHistory,
  IconAdjustments,
  IconHeartbeat,
  IconUserCheck,
  IconCashBanknote,
  IconCurrencyDollar,
  IconFileText,
  IconChalkboard,
  IconReceipt2,
  IconChartPie,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import type { AdminRole } from '@/lib/admin/roles';
import { can, type Capability } from '@/lib/admin/permissions';

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
  /** Icon key for the section itself (used by the header switcher + hub cards). */
  icon: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    key: 'pilotage',
    icon: 'overview',
    items: [
      { key: 'overview', href: '/admin', icon: 'overview', enabled: true, cap: 'overview.read' },
      { key: 'analytics', href: '/admin/analytics', icon: 'progress', enabled: true, cap: 'transactions.read' },
    ],
  },
  {
    key: 'content',
    icon: 'courses',
    items: [
      { key: 'courses', href: '/admin/cours', icon: 'courses', enabled: true, cap: 'courses.read' },
      { key: 'engagement', href: '/admin/engagement', icon: 'engagement', enabled: true, cap: 'courses.read' },
      { key: 'certificates', href: '/admin/certificats', icon: 'certificates', enabled: true, cap: 'courses.read' },
      { key: 'testimonials', href: '/admin/temoignages', icon: 'testimonials', enabled: true, cap: 'courses.read' },
      // NEW (Task A1) — moved out of /admin/parametres, which was a mix of
      // "site content" and "business settings". This is the site-content half.
      { key: 'siteContent', href: '/admin/contenu', icon: 'siteContent', enabled: true, cap: 'courses.edit' },
      // NEW (Task: studio access everywhere) — owner ask: "je ne vois pas
      // comment accéder au studio prof". No new capability: visible to any
      // admin who can already see this section (same `cap` as the other
      // content items) — the studio ITSELF still gates on approved-teacher
      // status (lib/teacher/profile.ts's `isApprovedTeacher`), same as
      // /enseigner/studio always has.
      { key: 'myStudio', href: '/enseigner/studio', icon: 'myStudio', enabled: true, cap: 'courses.read' },
    ],
  },
  {
    key: 'teachers',
    icon: 'teachers',
    items: [
      { key: 'teachers', href: '/admin/enseignants', icon: 'teachers', enabled: true, cap: 'teachers.review' },
      { key: 'payouts', href: '/admin/retraits', icon: 'payouts', enabled: true, cap: 'payouts.process' },
      // Task: pro-rata split of PNICE all-access revenue — the "Pass PNICE"
      // pool distributed pro-rata across teachers each month. Same cap as
      // 'payouts' (payouts.process): this page moves money into the SAME
      // teacher ledger that page's queue reads.
      { key: 'platformSplit', href: '/admin/repartition', icon: 'platformSplit', enabled: true, cap: 'payouts.process' },
    ],
  },
  {
    key: 'people',
    icon: 'users',
    items: [
      { key: 'users', href: '/admin/utilisateurs', icon: 'users', enabled: true, cap: 'users.read' },
      { key: 'support', href: '/admin/support', icon: 'support', enabled: true, cap: 'support.read' },
    ],
  },
  {
    key: 'money',
    icon: 'payments',
    items: [
      { key: 'payments', href: '/admin/transactions', icon: 'payments', enabled: true, cap: 'transactions.read' },
      { key: 'subscriptions', href: '/admin/abonnements', icon: 'subscriptions', enabled: true, cap: 'transactions.read' },
      { key: 'marketing', href: '/admin/marketing', icon: 'marketing', enabled: true, cap: 'users.act' },
    ],
  },
  {
    key: 'platform',
    icon: 'platform',
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
      // Task: two subscription products — the owner-set "Pass PNICE"
      // all-access price. Same cap as 'taux' (roles.manage ⇒ super-admin
      // only): a platform-wide price is owner-level, same reasoning as the
      // FX rate.
      { key: 'prix', href: '/admin/prix', icon: 'prix', enabled: true, cap: 'roles.manage' },
      { key: 'roles', href: '/admin/role', icon: 'roles', enabled: true, cap: 'roles.manage' },
      { key: 'audit', href: '/admin/audit', icon: 'audit', enabled: true, cap: 'roles.manage' },
      { key: 'health', href: '/admin/sante', icon: 'health', enabled: true, cap: 'support.read' },
    ],
  },
];

/** Flat view, in case anything needs the plain list (e.g. active-item lookup). */
export const ADMIN_NAV: AdminNavItem[] = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);

/** Icon key → component. Shared by AdminShell (sidebar + header switcher) and SpacesHub. */
export const ADMIN_NAV_ICONS: Record<string, TablerIcon> = {
  overview: IconLayoutDashboard,
  users: IconUsers,
  teachers: IconUserCheck,
  payouts: IconCashBanknote,
  courses: IconBook,
  subscriptions: IconRefresh,
  payments: IconCreditCard,
  progress: IconChartLine,
  engagement: IconActivity,
  certificates: IconCertificate,
  testimonials: IconStar,
  marketing: IconSpeakerphone,
  support: IconLifebuoy,
  health: IconHeartbeat,
  roles: IconShieldLock,
  audit: IconHistory,
  settings: IconSettings,
  platform: IconAdjustments,
  taux: IconCurrencyDollar,
  prix: IconReceipt2,
  siteContent: IconFileText,
  myStudio: IconChalkboard,
  platformSplit: IconChartPie,
};

/**
 * Sections filtered to what `role` can reach: hide items lacking the cap, then
 * drop a whole section once none of its items remain. This is THE single
 * source of truth for "what can this role reach" in the admin nav — AdminShell
 * (sidebar + header switcher) and SpacesHub (dashboard access cards) both call
 * this instead of re-deriving the filter, so they cannot drift apart.
 */
export function visibleSections(role: AdminRole): AdminNavSection[] {
  return ADMIN_NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.cap || can(role, i.cap)),
  })).filter((s) => s.items.length > 0);
}

/** First enabled, linkable item in a (already role-filtered) section, if any. */
export function firstReachableHref(section: AdminNavSection): string | undefined {
  return section.items.find((i) => i.enabled && i.href)?.href;
}
