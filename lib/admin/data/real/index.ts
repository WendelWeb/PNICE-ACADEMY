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
 * users), CERTIFICATES (list, verify-by-code, revoke/reissue/issue),
 * SUBSCRIPTIONS (list, events, dunning, renewals + series, cohorts, KPIs,
 * cancellation reasons — see lib/admin/data/real/subscriptions.ts for the
 * documented degeneracies where the schema lacks a mock-only column),
 * ANALYTICS (getAnalytics — revenue/signups/enrollments/method/course/geo/
 * language/funnel/heatmap; see lib/admin/data/real/analytics.ts for the
 * documented degeneracies, notably the MOCK-flagged visitor→account funnel
 * step, which has no real traffic-analytics source), MARKETING (promo codes
 * incl. public validatePromo, UTM attribution, abandoned/open carts, referrals,
 * referral credit — see lib/admin/data/real/marketing.ts for the documented
 * degeneracy on promo_redemptions' missing per-redemption financial columns).
 * Pending: support — still served by the mock.
 */
import type { AdminDataSource } from '../types';
import { mockDataSource } from '../mock';
import * as users from './users';
import * as tx from './transactions';
import * as engagement from './engagement';
import * as certs from './certificates';
import * as subs from './subscriptions';
import * as analytics from './analytics';
import * as marketing from './marketing';

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
  };
}
