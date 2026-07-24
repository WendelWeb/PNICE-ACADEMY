/**
 * Drizzle-backed data source (Phase D Lot 3) — assembled INCREMENTALLY.
 *
 * Domains already migrated to the real DB override the mock; the mock spread
 * below is now unreachable for every AdminDataSource method (kept as a
 * structural safety net, not because anything still falls through to it — see
 * "Migrated so far", and the exhaustive method-by-method cross-check against
 * the AdminDataSource interface in the L2f completion report).
 *
 * Migrated so far — ALL 75 AdminDataSource methods REAL, migration GENUINELY
 * COMPLETE: USER cluster (list, detail, KPI overview, user mutations, audit),
 * TRANSACTIONS (list, export, method volumes), COURSE SALES (getCourseSales,
 * getCourseDetail — see lib/admin/data/real/courses.ts for the documented
 * degeneracies/adaptations, notably completions=certificate-count mirroring
 * the mock's own courseStats generator and avgWatchMinutes being real
 * per-lesson-index data where the mock had a synthetic hash), ENGAGEMENT
 * (course completion/times/lesson views/aggregate drop-off/active
 * learners/stuck users), CERTIFICATES (list, verify-by-code,
 * revoke/reissue/issue), AUDIT LOG (getAuditLog, exportAuditLog — see
 * lib/admin/data/real/audit.ts; reads the SAME audit_log table every real
 * mutation across every domain already writes to via recordAudit, closing the
 * disconnect where real actions were audited but the viewer still showed
 * mock rows), SUBSCRIPTIONS (list, events, dunning, renewals + series,
 * cohorts, KPIs, cancellation reasons — see
 * lib/admin/data/real/subscriptions.ts for the documented degeneracies where
 * the schema lacks a mock-only column), ANALYTICS (getAnalytics —
 * revenue/signups/enrollments/method/course/geo/language/funnel/heatmap; see
 * lib/admin/data/real/analytics.ts for the documented degeneracies, notably
 * the MOCK-flagged visitor→account funnel step, which has no real
 * traffic-analytics source), MARKETING (promo codes incl. public
 * validatePromo, UTM attribution, abandoned/open carts, referrals, referral
 * credit — see lib/admin/data/real/marketing.ts for the documented degeneracy
 * on promo_redemptions' missing per-redemption financial columns), SUPPORT &
 * SYSTÈME (tickets incl. the public createTicket entry point, templates,
 * notifications, webhook logs, error logs, digest settings — see
 * lib/admin/data/real/support.ts for the documented degeneracies, notably the
 * Clerk-id↔users.id resolution `createTicket` performs to satisfy
 * support_tickets' uuid FK).
 */
import type { AdminDataSource } from '../types';
import { mockDataSource } from '../mock';
import * as users from './users';
import * as tx from './transactions';
import * as courseSales from './courses';
import * as engagement from './engagement';
import * as certs from './certificates';
import * as audit from './audit';
import * as subs from './subscriptions';
import * as analytics from './analytics';
import * as marketing from './marketing';
import * as support from './support';

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

    // ── COURSE SALES domain (real) ───────────────────────────────────────
    getCourseSales: courseSales.getCourseSales,
    getCourseDetail: courseSales.getCourseDetail,

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

    // ── AUDIT LOG domain (real) ────────────────────────────────────────────
    getAuditLog: audit.getAuditLog,
    exportAuditLog: audit.exportAuditLog,

    // ── SUBSCRIPTIONS domain (real) ───────────────────────────────────────
    getSubscriptions: subs.getSubscriptions,
    getSubEvents: subs.getSubEvents,
    getDunning: subs.getDunning,
    getRenewals: subs.getRenewals,
    getRenewalSeries: subs.getRenewalSeries,
    getCohorts: subs.getCohorts,
    getSubKpis: subs.getSubKpis,
    getCancellationReasons: subs.getCancellationReasons,

    // ── ANALYTICS domain (real) ───────────────────────────────────────────
    getAnalytics: analytics.getAnalytics,

    // ── MARKETING domain (real) ───────────────────────────────────────────
    getPromoCodes: marketing.getPromoCodes,
    getPromoDetail: marketing.getPromoDetail,
    isPromoCodeFree: marketing.isPromoCodeFree,
    createPromoCode: marketing.createPromoCode,
    setPromoActive: marketing.setPromoActive,
    deletePromoCode: marketing.deletePromoCode,
    validatePromo: marketing.validatePromo,
    redeemPromo: marketing.redeemPromo,
    getUtmAttribution: marketing.getUtmAttribution,
    getAbandonedCarts: marketing.getAbandonedCarts,
    getOpenCarts: marketing.getOpenCarts,
    getCartStats: marketing.getCartStats,
    markCartAbandoned: marketing.markCartAbandoned,
    remindCart: marketing.remindCart,
    getReferrers: marketing.getReferrers,
    getReferrerDetail: marketing.getReferrerDetail,
    getReferralCreditCents: marketing.getReferralCreditCents,
    setReferralCredit: marketing.setReferralCredit,
    // addManualCredit already real via users.ts (spread above) — not re-implemented here.

    // ── SUPPORT & SYSTÈME domain (real) ───────────────────────────────────
    getTickets: support.getTickets,
    getTicketById: support.getTicketById,
    getOpenUnassignedCount: support.getOpenUnassignedCount,
    createTicket: support.createTicket,
    assignTicket: support.assignTicket,
    replyTicket: support.replyTicket,
    setTicketStatus: support.setTicketStatus,
    getTemplates: support.getTemplates,
    createTemplate: support.createTemplate,
    updateTemplate: support.updateTemplate,
    deleteTemplate: support.deleteTemplate,
    getNotifications: support.getNotifications,
    markNotificationRead: support.markNotificationRead,
    markAllNotificationsRead: support.markAllNotificationsRead,
    getWebhookLogs: support.getWebhookLogs,
    replayWebhook: support.replayWebhook,
    getErrorLogs: support.getErrorLogs,
    getSupportSettings: support.getSupportSettings,
    setSupportSettings: support.setSupportSettings,
  };
}
