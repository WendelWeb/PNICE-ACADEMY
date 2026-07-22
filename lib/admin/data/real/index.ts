/**
 * Drizzle-backed data source (Phase D Lot 3) — assembled INCREMENTALLY.
 *
 * Domains already migrated to the real DB override the mock; everything not yet
 * migrated falls back to `mockDataSource`, so flipping ADMIN_DATA_SOURCE=real
 * never fully breaks the admin during the migration. As each domain lands here,
 * delete its mock fallback by adding the real method to the spread below.
 *
 * Migrated so far: USER cluster (list, detail, KPI overview, user mutations,
 * audit). Pending: transactions, subscriptions, analytics, engagement,
 * certificates, marketing, support — all still served by the mock.
 */
import type { AdminDataSource } from '../types';
import { mockDataSource } from '../mock';
import * as users from './users';

export function realDataSource(): AdminDataSource {
  return {
    ...mockDataSource,

    // ── USER cluster (real) ──────────────────────────────────────────────
    getKpiOverview: users.getKpiOverview,
    getUsers: users.getUsers,
    exportUsers: users.exportUsers,
    getUserById: users.getUserById,
    recordAudit: users.recordAudit,
    setUserStatus: users.setUserStatus,
    addManualCredit: users.addManualCredit,
    grantCourseAccess: users.grantCourseAccess,
    revokeCourseAccess: users.revokeCourseAccess,
    grantSubscription: users.grantSubscription,
    refundPayment: users.refundPayment,
  };
}
