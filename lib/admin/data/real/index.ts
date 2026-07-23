/**
 * Drizzle-backed data source (Phase D Lot 3) — assembled INCREMENTALLY.
 *
 * Domains already migrated to the real DB override the mock; everything not yet
 * migrated falls back to `mockDataSource`, so flipping ADMIN_DATA_SOURCE=real
 * never fully breaks the admin during the migration. As each domain lands here,
 * delete its mock fallback by adding the real method to the spread below.
 *
 * Migrated so far: USER cluster (list, detail, KPI overview, user mutations,
 * audit), TRANSACTIONS (list, export, method volumes), ENGAGEMENT (course
 * completion/times/lesson views/aggregate drop-off/active learners/stuck
 * users), CERTIFICATES (list, verify-by-code, revoke/reissue/issue). Pending:
 * subscriptions, analytics, marketing, support — all still served by the mock.
 */
import type { AdminDataSource } from '../types';
import { mockDataSource } from '../mock';
import * as users from './users';
import * as tx from './transactions';
import * as engagement from './engagement';
import * as certs from './certificates';

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

    // ── TRANSACTIONS domain (real) ───────────────────────────────────────
    getTransactions: tx.getTransactions,
    exportTransactions: tx.exportTransactions,
    getMethodVolumes: tx.getMethodVolumes,

    // ── ENGAGEMENT domain (real) ──────────────────────────────────────────
    getCourseCompletion: engagement.getCourseCompletion,
    getCourseTimes: engagement.getCourseTimes,
    getLessonViews: engagement.getLessonViews,
    getAggregateDropoff: engagement.getAggregateDropoff,
    getActiveLearners: engagement.getActiveLearners,
    getStuckUsers: engagement.getStuckUsers,

    // ── CERTIFICATES domain (real) ────────────────────────────────────────
    getCertificates: certs.getCertificates,
    getCertificateByCode: certs.getCertificateByCode,
    revokeCertificate: certs.revokeCertificate,
    reissueCertificate: certs.reissueCertificate,
    issueCertificate: certs.issueCertificate,
  };
}
