/**
 * Admin data — SINGLE SWITCH POINT.
 *
 * The whole admin UI imports its data from here and nowhere else. With
 * ADMIN_DATA_SOURCE=real it resolves to the Drizzle-backed source (incremental:
 * implemented domains hit the DB, the rest fall back to mock — see ./real);
 * otherwise the in-memory mock. No UI component changes either way.
 */
import type { AdminDataSource } from './types';
import { mockDataSource } from './mock';
import { realDataSource } from './real';

const source: AdminDataSource =
  process.env.ADMIN_DATA_SOURCE === 'real' ? realDataSource() : mockDataSource;

/* Reads */
export const getKpiOverview = () => source.getKpiOverview();
export const getUsers: AdminDataSource['getUsers'] = (q) => source.getUsers(q);
export const exportUsers: AdminDataSource['exportUsers'] = (q) => source.exportUsers(q);
export const getUserById: AdminDataSource['getUserById'] = (id) => source.getUserById(id);
export const getTransactions: AdminDataSource['getTransactions'] = (q) => source.getTransactions(q);
export const exportTransactions: AdminDataSource['exportTransactions'] = (q) =>
  source.exportTransactions(q);
export const getMethodVolumes: AdminDataSource['getMethodVolumes'] = () => source.getMethodVolumes();
export const getCourseSales: AdminDataSource['getCourseSales'] = () => source.getCourseSales();
export const getCourseDetail: AdminDataSource['getCourseDetail'] = (s) => source.getCourseDetail(s);
export const getAnalytics: AdminDataSource['getAnalytics'] = (q) => source.getAnalytics(q);
export const getSubscriptions: AdminDataSource['getSubscriptions'] = (q) => source.getSubscriptions(q);
export const getSubEvents: AdminDataSource['getSubEvents'] = () => source.getSubEvents();
export const getDunning: AdminDataSource['getDunning'] = () => source.getDunning();
export const getRenewals: AdminDataSource['getRenewals'] = (d) => source.getRenewals(d);
export const getRenewalSeries: AdminDataSource['getRenewalSeries'] = (d) => source.getRenewalSeries(d);
export const getCohorts: AdminDataSource['getCohorts'] = () => source.getCohorts();
export const getSubKpis: AdminDataSource['getSubKpis'] = () => source.getSubKpis();
export const getCancellationReasons: AdminDataSource['getCancellationReasons'] = () =>
  source.getCancellationReasons();

/* Engagement & certificates */
export const getCourseCompletion: AdminDataSource['getCourseCompletion'] = () =>
  source.getCourseCompletion();
export const getCourseTimes: AdminDataSource['getCourseTimes'] = () => source.getCourseTimes();
export const getLessonViews: AdminDataSource['getLessonViews'] = () => source.getLessonViews();
export const getAggregateDropoff: AdminDataSource['getAggregateDropoff'] = () =>
  source.getAggregateDropoff();
export const getActiveLearners: AdminDataSource['getActiveLearners'] = (q) =>
  source.getActiveLearners(q);
export const getStuckUsers: AdminDataSource['getStuckUsers'] = () => source.getStuckUsers();
export const getCertificates: AdminDataSource['getCertificates'] = (q) => source.getCertificates(q);
export const getCertificateByCode: AdminDataSource['getCertificateByCode'] = (c) =>
  source.getCertificateByCode(c);
export const getAuditLog: AdminDataSource['getAuditLog'] = (q) => source.getAuditLog(q);
export const exportAuditLog: AdminDataSource['exportAuditLog'] = (q) => source.exportAuditLog(q);
export const revokeCertificate: AdminDataSource['revokeCertificate'] = (p) =>
  source.revokeCertificate(p);
export const reissueCertificate: AdminDataSource['reissueCertificate'] = (p) =>
  source.reissueCertificate(p);
export const issueCertificate: AdminDataSource['issueCertificate'] = (p) =>
  source.issueCertificate(p);

/* Manual actions (each appends an audit entry) */
export const grantCourseAccess: AdminDataSource['grantCourseAccess'] = (p) =>
  source.grantCourseAccess(p);
export const revokeCourseAccess: AdminDataSource['revokeCourseAccess'] = (p) =>
  source.revokeCourseAccess(p);
export const grantSubscription: AdminDataSource['grantSubscription'] = (p) =>
  source.grantSubscription(p);
export const setUserStatus: AdminDataSource['setUserStatus'] = (p) => source.setUserStatus(p);
export const refundPayment: AdminDataSource['refundPayment'] = (p) => source.refundPayment(p);
export const recordAudit: AdminDataSource['recordAudit'] = (p) => source.recordAudit(p);

/* Marketing & acquisition (Phase D Lot 1) */
export const getPromoCodes: AdminDataSource['getPromoCodes'] = (q) => source.getPromoCodes(q);
export const getPromoDetail: AdminDataSource['getPromoDetail'] = (c) => source.getPromoDetail(c);
export const isPromoCodeFree: AdminDataSource['isPromoCodeFree'] = (c) => source.isPromoCodeFree(c);
export const createPromoCode: AdminDataSource['createPromoCode'] = (p) => source.createPromoCode(p);
export const setPromoActive: AdminDataSource['setPromoActive'] = (p) => source.setPromoActive(p);
export const deletePromoCode: AdminDataSource['deletePromoCode'] = (p) => source.deletePromoCode(p);
export const validatePromo: AdminDataSource['validatePromo'] = (p) => source.validatePromo(p);
export const redeemPromo: AdminDataSource['redeemPromo'] = (p) => source.redeemPromo(p);
export const getUtmAttribution: AdminDataSource['getUtmAttribution'] = (q) => source.getUtmAttribution(q);
export const getAbandonedCarts: AdminDataSource['getAbandonedCarts'] = () => source.getAbandonedCarts();
export const getOpenCarts: AdminDataSource['getOpenCarts'] = () => source.getOpenCarts();
export const getCartStats: AdminDataSource['getCartStats'] = () => source.getCartStats();
export const markCartAbandoned: AdminDataSource['markCartAbandoned'] = (p) => source.markCartAbandoned(p);
export const remindCart: AdminDataSource['remindCart'] = (p) => source.remindCart(p);
export const getReferrers: AdminDataSource['getReferrers'] = (s) => source.getReferrers(s);
export const getReferrerDetail: AdminDataSource['getReferrerDetail'] = (id) => source.getReferrerDetail(id);
export const getReferralCreditCents: AdminDataSource['getReferralCreditCents'] = () =>
  source.getReferralCreditCents();
export const setReferralCredit: AdminDataSource['setReferralCredit'] = (p) => source.setReferralCredit(p);
export const addManualCredit: AdminDataSource['addManualCredit'] = (p) => source.addManualCredit(p);

/* Support & système (Phase D Lot 2) */
export const getTickets: AdminDataSource['getTickets'] = (q) => source.getTickets(q);
export const getTicketById: AdminDataSource['getTicketById'] = (id) => source.getTicketById(id);
export const getOpenUnassignedCount: AdminDataSource['getOpenUnassignedCount'] = () => source.getOpenUnassignedCount();
export const createTicket: AdminDataSource['createTicket'] = (p) => source.createTicket(p);
export const assignTicket: AdminDataSource['assignTicket'] = (p) => source.assignTicket(p);
export const replyTicket: AdminDataSource['replyTicket'] = (p) => source.replyTicket(p);
export const setTicketStatus: AdminDataSource['setTicketStatus'] = (p) => source.setTicketStatus(p);
export const getTemplates: AdminDataSource['getTemplates'] = () => source.getTemplates();
export const createTemplate: AdminDataSource['createTemplate'] = (p) => source.createTemplate(p);
export const updateTemplate: AdminDataSource['updateTemplate'] = (p) => source.updateTemplate(p);
export const deleteTemplate: AdminDataSource['deleteTemplate'] = (p) => source.deleteTemplate(p);
export const getNotifications: AdminDataSource['getNotifications'] = (p) => source.getNotifications(p);
export const markNotificationRead: AdminDataSource['markNotificationRead'] = (p) => source.markNotificationRead(p);
export const markAllNotificationsRead: AdminDataSource['markAllNotificationsRead'] = () => source.markAllNotificationsRead();
export const getWebhookLogs: AdminDataSource['getWebhookLogs'] = (q) => source.getWebhookLogs(q);
export const replayWebhook: AdminDataSource['replayWebhook'] = (p) => source.replayWebhook(p);
export const getErrorLogs: AdminDataSource['getErrorLogs'] = () => source.getErrorLogs();
export const getSupportSettings: AdminDataSource['getSupportSettings'] = () => source.getSupportSettings();
export const setSupportSettings: AdminDataSource['setSupportSettings'] = (p) => source.setSupportSettings(p);

export type {
  Country,
  Locale,
  KpiOverview,
  AdminUser,
  AdminPayment,
  PaymentMethod,
  PaymentStatus,
  ProductType,
  AdminSubscription,
  SubscriptionStatus,
  AdminCourseStat,
  ActivityType,
  TxQuery,
  TxRow,
  TxPage,
  TxSortKey,
  TxSegment,
  MethodVolume,
  CourseSalesRow,
  CourseDetail,
  LessonFunnel,
  Granularity,
  AnalyticsQuery,
  AnalyticsData,
  RevenueBucket,
  CountBucket,
  EnrollBucket,
  SubGrowthBucket,
  MethodRevenue,
  CourseRevenue,
  CountryRow,
  FunnelStep,
  FunnelStepKey,
  HeatCell,
  SubQuery,
  SubRow,
  SubPage,
  SubDisplayStatus,
  SubSortKey,
  SubSegment,
  SubEvent,
  SubEventType,
  DunningRow,
  RenewalRow,
  RenewalDay,
  CohortRow,
  SubKpis,
  ReasonCount,
  CourseCompletionRow,
  CourseTimeRow,
  LessonViewRow,
  DropoffPoint,
  EngagementQuery,
  ActiveLearnerRow,
  StuckUserRow,
  CertRow,
  CertQuery,
  CertPage,
  CertVerification,
  AuditLogQuery,
  AuditPage,
  UserRow,
  UsersPage,
  UsersQuery,
  UserDetail,
  UserType,
  UserStatus,
  CourseBucket,
  SpecialSegment,
  UserSortKey,
  SortDir,
  CourseAccess,
  ActivityEvent,
  AuditEntry,
  AuditAction,
  AdminActor,
  DiscountType,
  PromoAppliesTo,
  PromoStatus,
  PromoCode,
  PromoRedemption,
  PromoQuery,
  PromoSortKey,
  PromoRow,
  PromoRedemptionRow,
  PromoDetail,
  PromoValidation,
  UserAcquisition,
  UtmQuery,
  UtmRow,
  CartReminderStatus,
  CheckoutSession,
  AbandonedCartRow,
  OpenCartRow,
  CartStats,
  ReferralStatus,
  Referral,
  ReferralSortKey,
  ReferrerRow,
  ReferredFilleul,
  ReferrerDetail,
  TicketType,
  TicketStatus,
  SupportTicket,
  SupportReply,
  TicketQuery,
  TicketRow,
  TicketPage,
  TicketDetail,
  SupportTemplate,
  AdminNotifKind,
  AdminNotification,
  NotificationFeed,
  WebhookStatus,
  WebhookLog,
  WebhookQuery,
  ErrorLog,
  SupportSettings,
} from './types';
