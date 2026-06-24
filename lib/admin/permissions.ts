/**
 * Role → capability matrix for the admin. Defines what each role can READ and
 * DO. Enforced server-side (actions + route gates) and used to hide nav items a
 * role can't reach. Keep dependency-free (imported by middleware/shell/actions).
 */
import type { AdminRole } from './roles';

export type Capability =
  | 'overview.read'
  | 'users.read'
  | 'users.act'
  | 'transactions.read'
  | 'transactions.refund'
  | 'courses.read'
  | 'courses.edit'
  | 'support.read'
  | 'support.act'
  | 'settings.manage'
  | 'roles.manage';

export const ALL_CAPABILITIES: Capability[] = [
  'overview.read',
  'users.read',
  'users.act',
  'transactions.read',
  'transactions.refund',
  'courses.read',
  'courses.edit',
  'support.read',
  'support.act',
  'settings.manage',
  'roles.manage',
];

const MATRIX: Record<AdminRole, Capability[]> = {
  // Full control, including managing other admins.
  'super-admin': [...ALL_CAPABILITIES],
  // Operates everything but cannot grant/revoke admin roles.
  admin: [
    'overview.read',
    'users.read',
    'users.act',
    'transactions.read',
    'transactions.refund',
    'courses.read',
    'courses.edit',
    'support.read',
    'support.act',
    'settings.manage',
  ],
  // Support desk: read operational data + run the support workbench (tickets,
  // replies, system health) — but no refunds, role or content mutations.
  support: ['overview.read', 'users.read', 'transactions.read', 'courses.read', 'support.read', 'support.act'],
  // Content team: courses only.
  'editeur-contenu': ['overview.read', 'courses.read', 'courses.edit'],
};

export function capabilitiesOf(role: AdminRole): Capability[] {
  return MATRIX[role];
}

export function can(role: AdminRole, cap: Capability): boolean {
  return MATRIX[role].includes(cap);
}
