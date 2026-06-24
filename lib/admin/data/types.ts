/**
 * Admin data layer — typed domain contract.
 *
 * This is the seam between the admin UI and its data. Today every getter is
 * served from an in-memory MOCK dataset (lib/admin/data/mock). Later, the same
 * function signatures get a Drizzle-backed implementation and the UI does NOT
 * change — see lib/admin/data/index.ts for the single switch point.
 *
 * Keep this file free of React / Next imports: it is pure types + the contract.
 */

export type Country = 'HT' | 'diaspora';
export type Locale = 'ht' | 'fr';

/** The five payment rails the platform will support (see Phase 2 schema). */
export type PaymentMethod = 'moncash' | 'natcash' | 'card' | 'paypal' | 'crypto';
export type PaymentStatus = 'succeeded' | 'failed' | 'refunded' | 'pending';
export type ProductType = 'course' | 'subscription';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due';
export type UserStatus = 'active' | 'suspended' | 'banned';

/* -------------------------------------------------------------------------- */
/* Domain entities (one type per domain — users, payments, courses, …)        */
/* -------------------------------------------------------------------------- */

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: Country;
  city: string;
  language: Locale;
  certificateName: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Subscription (=9) or count of à-l'unité courses owned. */
  coursesOwned: number;
  isSubscriber: boolean;
  status: UserStatus;
  /** ISO timestamp of last lesson activity, or null if never watched. */
  lastActiveAt: string | null;
};

export type AdminPayment = {
  id: string;
  userId: string;
  productType: ProductType;
  /** Slug of the formation for à-l'unité purchases; null for subscription charges. */
  courseSlug: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  currency: 'USD';
  createdAt: string;
  /** Set on refund rows / refunded originals. */
  isRefund?: boolean;
};

export type AdminSubscription = {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  startedAt: string;
  /** ISO timestamp when canceled, or null if still active/past_due. */
  canceledAt: string | null;
  amountCents: number;
  /** Provider used for the recurring charge. card/paypal auto-renew; the rest are manual. */
  provider: PaymentMethod;
  /** ISO timestamp of the next renewal (or the end date for canceled subs). */
  currentPeriodEnd: string;
  cancellationReason: string | null;
  /** Reminders already sent for a past_due subscription. */
  dunningAttempts?: number;
  /** First failed charge date for a past_due subscription. */
  firstFailedAt?: string;
  /** True when comped by an admin (no payment). */
  grantedByAdmin?: boolean;
};

export type EnrollmentSource = 'purchase' | 'subscription' | 'granted';

export type AdminEnrollment = {
  userId: string;
  courseSlug: string;
  enrolledAt: string;
  source: EnrollmentSource;
};

export type AdminCertificate = {
  id: string;
  userId: string;
  courseSlug: string;
  issuedAt: string;
  verificationCode: string;
  revoked?: boolean;
};

export type AdminProgress = {
  userId: string;
  courseSlug: string;
  lessonsDone: number;
  lessonsTotal: number;
  lastActivityAt: string;
};

export type CreditEntry = {
  id: string;
  userId: string;
  amountCents: number;
  reason: string;
  createdAt: string;
};

export type AdminCourseStat = {
  slug: string;
  code: string;
  title_fr: string;
  title_ht: string;
  priceUsdCents: number;
  enrollments: number;
  /** Revenue from à-l'unité purchases only (subscription revenue is shared). */
  revenueCents: number;
  completions: number;
  lessonsCount: number;
  published: boolean;
};

/* -------------------------------------------------------------------------- */
/* Audit log (manual admin actions)                                           */
/* -------------------------------------------------------------------------- */

export type AuditAction =
  | 'grant_course'
  | 'revoke_course'
  | 'grant_subscription'
  | 'suspend_user'
  | 'ban_user'
  | 'reactivate_user'
  | 'refund_payment'
  | 'resend_verification'
  | 'resend_receipt'
  | 'set_fx_rate'
  | 'dunning_reminder'
  | 'engagement_reminder'
  | 'revoke_certificate'
  | 'reissue_certificate'
  | 'issue_certificate'
  | 'review_request'
  | 'announcement'
  | 'invite_admin'
  | 'change_admin_role'
  | 'suspend_admin'
  | 'reactivate_admin'
  | 'toggle_provider'
  | 'set_sub_price'
  | 'toggle_maintenance'
  | 'impersonate'
  // Marketing & acquisition (Phase D Lot 1)
  | 'create_promo'
  | 'disable_promo'
  | 'enable_promo'
  | 'delete_promo'
  | 'redeem_promo'
  | 'cart_reminder'
  | 'set_referral_credit'
  | 'add_credit'
  // Support & système (Phase D Lot 2)
  | 'assign_ticket'
  | 'reply_ticket'
  | 'set_ticket_status'
  | 'create_template'
  | 'update_template'
  | 'delete_template'
  | 'replay_webhook'
  | 'set_digest';

export type AdminActor = { id: string; name: string };

export type AuditEntry = {
  id: string;
  adminId: string;
  adminName: string;
  action: AuditAction;
  targetUserId: string;
  /** Free-form detail: course slug, payment id, etc. */
  detail?: string;
  reason?: string;
  createdAt: string;
};

export type AuditLogQuery = {
  admin?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type AuditPage = {
  rows: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** Distinct (adminId, adminName) seen in the full log, for the filter dropdown. */
  admins: { id: string; name: string }[];
};

/* -------------------------------------------------------------------------- */
/* Users list (Tasks 1–4)                                                      */
/* -------------------------------------------------------------------------- */

export type UserType = 'active_subscriber' | 'one_off' | 'free';
export type UserSortKey = 'createdAt' | 'totalSpent' | 'lastActive';
export type SortDir = 'asc' | 'desc';
export type CourseBucket = '0' | '1' | '2' | '3' | '4' | '5plus';
export type SpecialSegment = 'inactive' | 'top_spenders';

export type UsersQuery = {
  search?: string;
  country?: Country;
  language?: Locale;
  type?: UserType;
  /** Bucket on number of courses with access (0 = never paid … 5plus). */
  courses?: CourseBucket;
  /** createdAt range (ISO date, inclusive). */
  from?: string;
  to?: string;
  segment?: SpecialSegment;
  sort?: UserSortKey;
  dir?: SortDir;
  page?: number;
  pageSize?: number;
};

/** A user enriched with the derived figures the list/detail need. */
export type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: Country;
  city: string;
  language: Locale;
  createdAt: string;
  type: UserType;
  status: UserStatus;
  subscriptionStatus: SubscriptionStatus | null;
  /** à-l'unité courses purchased (succeeded). */
  coursesPurchased: number;
  /** total courses with access (subscriber = full catalog). */
  coursesAccess: number;
  totalSpentCents: number;
  lastActiveAt: string | null;
  lastPaymentAt: string | null;
};

export type UsersPage = {
  rows: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  segmentCounts: {
    all: number;
    byType: Record<UserType, number>;
    byCourses: Record<CourseBucket, number>;
  };
};

/* -------------------------------------------------------------------------- */
/* User detail (Tasks 5–7)                                                     */
/* -------------------------------------------------------------------------- */

export type CourseAccess = {
  slug: string;
  code: string;
  title_fr: string;
  title_ht: string;
  source: EnrollmentSource;
  status: 'active' | 'expired';
  enrolledAt: string;
  lessonsDone: number;
  lessonsTotal: number;
};

export type ActivityType =
  | 'account_created'
  | 'purchase'
  | 'refund'
  | 'enrollment'
  | 'lesson'
  | 'certificate'
  | 'subscription';

export type ActivityEvent = {
  id: string;
  type: ActivityType;
  label_fr: string;
  label_ht: string;
  at: string;
};

export type UserDetail = {
  user: UserRow & { certificateName: string };
  payments: AdminPayment[];
  courses: CourseAccess[];
  certificates: AdminCertificate[];
  credits: CreditEntry[];
  creditBalanceCents: number;
  activity: ActivityEvent[];
  audit: AuditEntry[];
  /** First-touch acquisition source (UTM), or null if direct/unknown. */
  acquisition: UserAcquisition | null;
};

/* -------------------------------------------------------------------------- */
/* Transactions (Lot 3 Tasks 1–6)                                              */
/* -------------------------------------------------------------------------- */

export type TxSortKey = 'date' | 'amount';
export type TxSegment = 'failed_pending';

export type TxQuery = {
  search?: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
  productType?: ProductType;
  from?: string;
  to?: string;
  segment?: TxSegment;
  sort?: TxSortKey;
  dir?: SortDir;
  page?: number;
  pageSize?: number;
};

export type TxRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  productType: ProductType;
  /** "Abonnement mensuel" or a course title; code is PA-0X for courses. */
  productCode: string | null;
  productTitle_fr: string;
  productTitle_ht: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  createdAt: string;
  /** A pending transaction older than 24h is suspicious. */
  stalePending: boolean;
};

export type TxPage = {
  rows: TxRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; failed: number; pending: number };
};

export type MethodVolume = {
  method: PaymentMethod;
  grossCents: number;
  count: number;
};

/* -------------------------------------------------------------------------- */
/* Course stats (Lot 3 Tasks 7–8)                                              */
/* -------------------------------------------------------------------------- */

export type CourseSalesRow = {
  slug: string;
  code: string;
  title_fr: string;
  title_ht: string;
  priceUsdCents: number;
  enrollments: number;
  revenueCents: number;
  completions: number;
  completionRatePct: number;
  lessonsCount: number;
  published: boolean;
};

export type LessonFunnel = {
  index: number;
  title_fr: string;
  title_ht: string;
  /** Enrolled users who reached/opened this lesson. */
  opened: number;
  /** Enrolled users who completed this lesson. */
  completed: number;
  /** Enrolled users who never reached this lesson. */
  neverOpened: number;
  /** opened − completed, as % of opened (drop within the lesson). */
  dropPct: number;
  avgWatchMinutes: number;
};

export type CourseDetail = {
  course: CourseSalesRow;
  enrolled: number;
  lessons: LessonFunnel[];
  /** Index of the lesson with the largest opened→completed drop. */
  worstLessonIndex: number | null;
};

/* -------------------------------------------------------------------------- */
/* Subscriptions (Phase B Lot 2)                                               */
/* -------------------------------------------------------------------------- */

/** Display status adds pending_renewal (manual provider near period end). */
export type SubDisplayStatus = SubscriptionStatus | 'pending_renewal';
export type SubSortKey = 'renewal' | 'mrr';
export type SubSegment = 'renew7' | 'dunning';

export type SubQuery = {
  search?: string;
  status?: SubscriptionStatus;
  provider?: PaymentMethod;
  from?: string;
  to?: string;
  segment?: SubSegment;
  sort?: SubSortKey;
  dir?: SortDir;
  page?: number;
  pageSize?: number;
};

export type SubRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  provider: PaymentMethod;
  /** True for card/paypal (auto-renew); false = manual renewal. */
  auto: boolean;
  status: SubDisplayStatus;
  startedAt: string;
  currentPeriodEnd: string;
  mrrCents: number;
  amountCents: number;
};

export type SubPage = {
  rows: SubRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; active: number; past_due: number; canceled: number; renew7: number };
};

export type SubEventType = 'new' | 'renewed' | 'canceled' | 'failed' | 'reminder';
export type SubEvent = {
  id: string;
  type: SubEventType;
  userId: string;
  userName: string;
  provider: PaymentMethod;
  amountCents: number;
  at: string;
};

export type DunningRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  provider: PaymentMethod;
  auto: boolean;
  amountCents: number;
  firstFailedAt: string | null;
  attempts: number;
};

export type RenewalRow = {
  id: string;
  userId: string;
  userName: string;
  provider: PaymentMethod;
  auto: boolean;
  amountCents: number;
  currentPeriodEnd: string;
};

export type RenewalDay = {
  date: string;
  count: number;
  expectedCents: number;
  cumulativeCents: number;
};

export type CohortRow = {
  cohort: string;
  size: number;
  /** retention[k] = % still active at month k (M0..M6); null if cohort too young. */
  retention: (number | null)[];
};

export type ReasonCount = { reason: string; count: number };

export type SubKpis = {
  mrrCurrentCents: number;
  mrrPrevMonthCents: number;
  mrrChangeCents: number;
  mrrChangePct: number;
  /** MRR if all renewals in the next 30 days confirm (optimistic). */
  mrrProjectedCents: number;
  /** MRR lost on cancellations during the current month. */
  mrrChurnThisMonthCents: number;
  /** MRR of manual-provider subs renewing in the next 30 days (needs human action). */
  mrrAtRisk30dCents: number;
  activeCount: number;
};

/* -------------------------------------------------------------------------- */
/* Analytics / charts (Phase B Lot 1)                                          */
/* -------------------------------------------------------------------------- */

export type Granularity = 'day' | 'week' | 'month';

export type AnalyticsQuery = { from: string; to: string; granularity: Granularity };

export type RevenueBucket = {
  bucket: string;
  subscriptionCents: number;
  courseCents: number;
  totalCents: number;
};
export type CountBucket = { bucket: string; count: number };
export type EnrollBucket = { bucket: string; enrollments: number; subscriptions: number };
export type SubGrowthBucket = {
  bucket: string;
  activeCumulative: number;
  created: number;
  canceled: number;
};
export type MethodRevenue = { method: PaymentMethod; cents: number; pct: number };
export type CourseRevenue = {
  code: string;
  slug: string;
  title_fr: string;
  title_ht: string;
  revenueCents: number;
  enrollments: number;
};
export type CountryRow = { country: string; users: number; revenueCents: number };
export type FunnelStepKey =
  | 'visitors'
  | 'accounts'
  | 'firstPurchase'
  | 'firstLesson'
  | 'completed'
  | 'certificate';
export type FunnelStep = { step: FunnelStepKey; count: number };
export type HeatCell = { day: number; hour: number; count: number };

export type AnalyticsData = {
  granularity: Granularity;
  revenueSeries: RevenueBucket[];
  revenueTotalCents: number;
  subscriptionRevenueCents: number;
  courseRevenueCents: number;
  signupsSeries: CountBucket[];
  enrollmentsSeries: EnrollBucket[];
  revenueByMethod: MethodRevenue[];
  revenueByCourse: CourseRevenue[];
  subscriptionGrowth: SubGrowthBucket[];
  geo: { htUsers: number; diasporaUsers: number; topCountries: CountryRow[] };
  language: {
    ht: { users: number; revenueCents: number };
    fr: { users: number; revenueCents: number };
  };
  funnel: FunnelStep[];
  /** Lesson-view counts by weekday (0=Sun..6=Sat) × hour (0..23), Haiti UTC-5. */
  heatmap: HeatCell[];
};

/* -------------------------------------------------------------------------- */
/* Engagement & certificates (Phase B Lot 3)                                   */
/* -------------------------------------------------------------------------- */

export type CourseCompletionRow = {
  slug: string;
  code: string;
  title_fr: string;
  title_ht: string;
  enrolled: number;
  startedCount: number;
  completedCount: number;
  completionRatePct: number;
  lessonsCount: number;
};

export type CourseTimeRow = {
  slug: string;
  code: string;
  title_fr: string;
  title_ht: string;
  completers: number;
  medianDays: number;
  meanDays: number;
};

export type LessonViewRow = {
  slug: string;
  code: string;
  courseTitle_fr: string;
  courseTitle_ht: string;
  lessonIndex: number;
  lessonTitle_fr: string;
  lessonTitle_ht: string;
  views: number;
  enrolled: number;
  abandonPct: number;
};

export type DropoffPoint = { position: number; pct: number; learners: number };

export type EngagementQuery = { days?: number; course?: string };

export type ActiveLearnerRow = {
  userId: string;
  userName: string;
  userEmail: string;
  courseSlug: string;
  courseTitle_fr: string;
  courseTitle_ht: string;
  lessonsDone: number;
  lessonsTotal: number;
  lastActiveAt: string;
};

export type StuckUserRow = {
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  courses: { code: string; title_fr: string; title_ht: string }[];
  amountPaidCents: number;
};

export type CertRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  courseSlug: string;
  courseTitle_fr: string;
  courseTitle_ht: string;
  issuedAt: string;
  verificationCode: string;
  revoked: boolean;
};

export type CertQuery = {
  search?: string;
  course?: string;
  state?: 'valid' | 'revoked';
  page?: number;
  pageSize?: number;
};

export type CertPage = { rows: CertRow[]; total: number; page: number; pageSize: number };

export type CertVerification = {
  found: boolean;
  revoked: boolean;
  userName?: string;
  courseTitle_fr?: string;
  courseTitle_ht?: string;
  issuedAt?: string;
  code: string;
};

/* -------------------------------------------------------------------------- */
/* Support & système (Phase D Lot 2)                                           */
/* -------------------------------------------------------------------------- */

export type TicketType = 'question' | 'bug' | 'refund';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export type SupportTicket = {
  id: string;
  /** Mock learner id (usr_…) or a real Clerk id for owner-submitted tickets. */
  userId: string;
  userName: string;
  userEmail: string;
  type: TicketType;
  subject: string;
  message: string;
  status: TicketStatus;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  /** Payment under dispute for type='refund'. */
  relatedPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportReply = {
  id: string;
  ticketId: string;
  authorType: 'user' | 'admin';
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type TicketQuery = {
  search?: string;
  status?: TicketStatus;
  type?: TicketType;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type TicketRow = SupportTicket;

export type TicketPage = {
  rows: TicketRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; open: number; in_progress: number; resolved: number; unassignedOpen: number };
};

export type TicketDetail = {
  ticket: SupportTicket;
  replies: SupportReply[];
  payment: AdminPayment | null;
  /** True when userId maps to a mock learner (so the fiche link is valid). */
  userExists: boolean;
};

export type SupportTemplate = {
  id: string;
  category: string;
  title_ht: string;
  title_fr: string;
  body_ht: string;
  body_fr: string;
  createdAt: string;
};

export type AdminNotifKind = 'sale' | 'payment_failed' | 'refund_request' | 'sub_canceled' | 'webhook_error';

export type AdminNotification = {
  id: string;
  kind: AdminNotifKind;
  severity: 'info' | 'critical';
  userId: string | null;
  userName: string | null;
  amountCents: number | null;
  /** Product label / free context. */
  detail: string | null;
  createdAt: string;
  read: boolean;
};

export type NotificationFeed = { items: AdminNotification[]; unread: number; criticalUnread: number };

export type WebhookStatus = 'processed' | 'failed' | 'ignored';

export type WebhookLog = {
  id: string;
  provider: PaymentMethod;
  eventType: string;
  status: WebhookStatus;
  errorMessage: string | null;
  receivedAt: string;
  processedAt: string | null;
  retryCount: number;
  ref: string | null;
};

export type WebhookQuery = { provider?: PaymentMethod; status?: WebhookStatus; from?: string; to?: string };

export type ErrorLog = {
  id: string;
  message: string;
  /** Truncated stack trace. */
  stackTruncated: string;
  route: string;
  firstAt: string;
  lastAt: string;
  /** Identical errors grouped → occurrence count. */
  count: number;
};

export type SupportSettings = { dailyDigestEnabled: boolean; dailyDigestHour: number };

/* -------------------------------------------------------------------------- */
/* Marketing & acquisition (Phase D Lot 1)                                     */
/* -------------------------------------------------------------------------- */

export type DiscountType = 'percent' | 'fixed';
export type PromoAppliesTo = 'subscription' | 'course' | 'all';
/** Derived status. `scheduled` = startsAt in the future; `depleted` = maxUses hit. */
export type PromoStatus = 'active' | 'scheduled' | 'expired' | 'depleted' | 'disabled';

export type PromoCode = {
  id: string;
  code: string;
  discountType: DiscountType;
  /** percent: 1–100. fixed: USD cents (stored in cents like every amount). */
  discountValue: number;
  appliesTo: PromoAppliesTo;
  /** Set only when appliesTo === 'course'. */
  courseSlug: string | null;
  /** null = unlimited. */
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  /** Scheduled activation; null = active immediately. */
  startsAt: string | null;
  /** Admin on/off switch (disable without deleting). */
  isActive: boolean;
  createdAt: string;
};

export type PromoRedemption = {
  id: string;
  promoCodeId: string;
  userId: string;
  /** The payment the discount was applied to (null for mock/simulated redemptions). */
  paymentId: string | null;
  productType: ProductType;
  courseSlug: string | null;
  /** Price before discount. */
  grossCents: number;
  /** Amount discounted. */
  discountCents: number;
  /** grossCents − discountCents (what the user actually paid). */
  netCents: number;
  redeemedAt: string;
};

export type PromoSortKey = 'expiry' | 'usage';
export type PromoQuery = {
  search?: string;
  status?: PromoStatus;
  type?: DiscountType;
  sort?: PromoSortKey;
  dir?: SortDir;
};

export type PromoRow = PromoCode & {
  status: PromoStatus;
  /** usedCount / maxUses, 0–100; null when unlimited. */
  usagePct: number | null;
};

export type PromoRedemptionRow = PromoRedemption & {
  userName: string;
  userEmail: string;
};

export type PromoDetail = {
  promo: PromoRow;
  redemptions: PromoRedemptionRow[];
  /** Sum of netCents — revenue actually collected with the code. */
  revenueGeneratedCents: number;
  /** Sum of grossCents — what the same purchases would have cost at full price.
   *  Indicative ONLY: assumes every buyer would have bought without the discount,
   *  which is not analytically rigorous (a promo can convert users who otherwise
   *  would not have purchased). Surfaced as a rough comparison, not a fact. */
  revenueUndiscountedCents: number;
  discountGivenCents: number;
};

/** Result of validating a code at checkout against a concrete price. */
export type PromoValidation = {
  valid: boolean;
  /** 'ok' | 'not_found' | 'inactive' | 'expired' | 'depleted' | 'scheduled' | 'wrong_product' */
  reason: string;
  code: string;
  discountType?: DiscountType;
  discountValue?: number;
  grossCents?: number;
  discountCents?: number;
  netCents?: number;
};

/* ---- UTM attribution (Task 5) ---- */
export type UserAcquisition = {
  userId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  /** First-touch timestamp (never overwritten). */
  capturedAt: string;
};

export type UtmQuery = { from?: string; to?: string };

export type UtmRow = {
  source: string;
  medium: string;
  campaign: string;
  signups: number;
  /** Signups that became paying (a succeeded payment or active subscription). */
  converted: number;
  revenueCents: number;
  conversionPct: number;
};

/* ---- Abandoned carts (Tasks 6–7) ---- */
export type CartReminderStatus = 'never' | 'reminded' | 'converted';

export type CheckoutSession = {
  id: string;
  userId: string | null;
  /** Set for guests (not logged in). */
  sessionId: string | null;
  productType: ProductType;
  courseSlug: string | null;
  amountCents: number;
  startedAt: string;
  completedAt: string | null;
  /** Filled when the session is past the 2h window with no completion. */
  abandonedAt: string | null;
  remindedAt: string | null;
};

export type AbandonedCartRow = {
  id: string;
  userId: string | null;
  isGuest: boolean;
  userName: string;
  userEmail: string | null;
  productType: ProductType;
  productCode: string | null;
  productTitle_fr: string;
  productTitle_ht: string;
  amountCents: number;
  startedAt: string;
  abandonedAt: string | null;
  reminderStatus: CartReminderStatus;
};

export type CartStats = {
  abandoned: number;
  reminded: number;
  convertedAfterReminder: number;
  /** convertedAfterReminder / reminded. */
  reminderConversionPct: number;
};

/** A still-open session (started, not completed/abandoned) — target for the
 *  manual "mark abandoned" sim that stands in for the 2h cron until it lands. */
export type OpenCartRow = {
  id: string;
  userName: string;
  productTitle_fr: string;
  productTitle_ht: string;
  amountCents: number;
  startedAt: string;
};

/* ---- Referral programme (Tasks 8–9) ---- */
export type ReferralStatus = 'pending' | 'confirmed';

export type Referral = {
  id: string;
  referrerUserId: string;
  /** null while the invite hasn't created an account yet. */
  referredUserId: string | null;
  referralCode: string;
  status: ReferralStatus;
  createdAt: string;
  confirmedAt: string | null;
};

export type ReferralSortKey = 'converted' | 'credits';

export type ReferrerRow = {
  userId: string;
  userName: string;
  userEmail: string;
  referralCode: string;
  /** Total filleuls invited. */
  invited: number;
  /** Filleuls confirmed (first purchase made). */
  converted: number;
  /** Sum of credit_ledger entries with reason 'referral'. */
  creditsCents: number;
};

export type ReferredFilleul = {
  userId: string | null;
  userName: string;
  status: ReferralStatus;
  createdAt: string;
  confirmedAt: string | null;
};

export type ReferrerDetail = {
  referrer: ReferrerRow;
  filleuls: ReferredFilleul[];
};

/* -------------------------------------------------------------------------- */
/* The data contract                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every screen talks to the admin through this interface. Both the mock and the
 * future Drizzle implementation satisfy it; UI never imports the mock directly.
 */
export interface AdminDataSource {
  getKpiOverview(): Promise<KpiOverview>;

  // Users (read)
  getUsers(query: UsersQuery): Promise<UsersPage>;
  exportUsers(query: UsersQuery): Promise<UserRow[]>;
  getUserById(id: string): Promise<UserDetail | null>;

  // Transactions + courses (read)
  getTransactions(query: TxQuery): Promise<TxPage>;
  exportTransactions(query: TxQuery): Promise<TxRow[]>;
  getMethodVolumes(): Promise<MethodVolume[]>;
  getCourseSales(): Promise<CourseSalesRow[]>;
  getCourseDetail(slug: string): Promise<CourseDetail | null>;

  // Analytics (charts)
  getAnalytics(query: AnalyticsQuery): Promise<AnalyticsData>;

  // Subscriptions
  getSubscriptions(query: SubQuery): Promise<SubPage>;
  getSubEvents(): Promise<SubEvent[]>;
  getDunning(): Promise<DunningRow[]>;
  getRenewals(days: number): Promise<RenewalRow[]>;
  getRenewalSeries(days: number): Promise<RenewalDay[]>;
  getCohorts(): Promise<CohortRow[]>;
  getSubKpis(): Promise<SubKpis>;
  getCancellationReasons(): Promise<ReasonCount[]>;

  // Engagement & certificates
  getCourseCompletion(): Promise<CourseCompletionRow[]>;
  getCourseTimes(): Promise<CourseTimeRow[]>;
  getLessonViews(): Promise<{ top: LessonViewRow[]; bottom: LessonViewRow[] }>;
  getAggregateDropoff(): Promise<DropoffPoint[]>;
  getActiveLearners(query: EngagementQuery): Promise<ActiveLearnerRow[]>;
  getStuckUsers(): Promise<StuckUserRow[]>;
  getCertificates(query: CertQuery): Promise<CertPage>;
  getCertificateByCode(code: string): Promise<CertVerification>;
  getAuditLog(query: AuditLogQuery): Promise<AuditPage>;
  exportAuditLog(query: AuditLogQuery): Promise<AuditEntry[]>;
  revokeCertificate(p: { certId: string; admin: AdminActor }): Promise<void>;
  reissueCertificate(p: { certId: string; admin: AdminActor }): Promise<void>;
  issueCertificate(p: { userId: string; courseSlug: string; admin: AdminActor }): Promise<void>;

  // Users (manual actions — each appends an audit entry)
  grantCourseAccess(p: { userId: string; courseSlug: string; admin: AdminActor }): Promise<void>;
  revokeCourseAccess(p: { userId: string; courseSlug: string; admin: AdminActor }): Promise<void>;
  grantSubscription(p: { userId: string; admin: AdminActor }): Promise<void>;
  setUserStatus(p: {
    userId: string;
    status: UserStatus;
    reason: string;
    admin: AdminActor;
  }): Promise<void>;
  refundPayment(p: { userId: string; paymentId: string; admin: AdminActor }): Promise<void>;
  /** Record a Clerk-side action (resend verification, impersonate) in the audit log. */
  recordAudit(p: {
    action: AuditAction;
    userId: string;
    admin: AdminActor;
    detail?: string;
    reason?: string;
  }): Promise<void>;

  // Marketing & acquisition (Phase D Lot 1)
  getPromoCodes(query: PromoQuery): Promise<PromoRow[]>;
  getPromoDetail(codeOrId: string): Promise<PromoDetail | null>;
  isPromoCodeFree(code: string): Promise<boolean>;
  createPromoCode(p: {
    input: Omit<PromoCode, 'id' | 'usedCount' | 'createdAt'>;
    admin: AdminActor;
  }): Promise<{ ok: boolean; message?: string; code?: string }>;
  setPromoActive(p: { id: string; active: boolean; admin: AdminActor }): Promise<void>;
  deletePromoCode(p: { id: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }>;
  validatePromo(p: {
    code: string;
    productType: ProductType;
    courseSlug: string | null;
    grossCents: number;
  }): Promise<PromoValidation>;
  redeemPromo(p: {
    code: string;
    userId: string;
    admin: AdminActor;
  }): Promise<{ ok: boolean; message?: string }>;
  getUtmAttribution(query: UtmQuery): Promise<UtmRow[]>;
  getAbandonedCarts(): Promise<AbandonedCartRow[]>;
  getOpenCarts(): Promise<OpenCartRow[]>;
  getCartStats(): Promise<CartStats>;
  markCartAbandoned(p: { id: string; admin: AdminActor }): Promise<void>;
  remindCart(p: { id: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }>;
  getReferrers(sort: ReferralSortKey): Promise<ReferrerRow[]>;
  getReferrerDetail(userId: string): Promise<ReferrerDetail | null>;
  getReferralCreditCents(): Promise<number>;
  setReferralCredit(p: { cents: number; admin: AdminActor }): Promise<void>;
  addManualCredit(p: {
    userId: string;
    amountCents: number;
    note: string;
    admin: AdminActor;
  }): Promise<void>;

  // Support & système (Phase D Lot 2)
  getTickets(query: TicketQuery): Promise<TicketPage>;
  getTicketById(id: string): Promise<TicketDetail | null>;
  getOpenUnassignedCount(): Promise<number>;
  createTicket(p: {
    userId: string;
    userName: string;
    userEmail: string;
    type: TicketType;
    subject: string;
    message: string;
    relatedPaymentId?: string | null;
  }): Promise<{ id: string }>;
  assignTicket(p: { ticketId: string; adminId: string | null; adminName: string | null; actor: AdminActor }): Promise<void>;
  replyTicket(p: { ticketId: string; body: string; actor: AdminActor }): Promise<{ ok: boolean; message?: string }>;
  setTicketStatus(p: { ticketId: string; status: TicketStatus; actor: AdminActor }): Promise<void>;
  getTemplates(): Promise<SupportTemplate[]>;
  createTemplate(p: { input: Omit<SupportTemplate, 'id' | 'createdAt'>; actor: AdminActor }): Promise<{ id: string }>;
  updateTemplate(p: { id: string; patch: Partial<Omit<SupportTemplate, 'id' | 'createdAt'>>; actor: AdminActor }): Promise<void>;
  deleteTemplate(p: { id: string; actor: AdminActor }): Promise<void>;
  getNotifications(p?: { limit?: number }): Promise<NotificationFeed>;
  markNotificationRead(p: { id: string }): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  getWebhookLogs(query: WebhookQuery): Promise<WebhookLog[]>;
  replayWebhook(p: { id: string; actor: AdminActor }): Promise<{ ok: boolean; message?: string }>;
  getErrorLogs(): Promise<ErrorLog[]>;
  getSupportSettings(): Promise<SupportSettings>;
  setSupportSettings(p: { enabled: boolean; hour: number; actor: AdminActor }): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* KPI overview (Tasks 5–8 of Lot 1)                                           */
/* -------------------------------------------------------------------------- */

export type KpiOverview = {
  currency: 'USD';

  totalUsers: number;
  activeSubscribers: number;
  mrrCents: number;
  totalRevenueCents: number;
  revenueThisMonthCents: number;

  newUsersToday: number;
  newUsers7d: number;
  newUsers30d: number;
  newEnrollmentsToday: number;
  newEnrollments7d: number;
  newEnrollments30d: number;

  /**
   * MOCK ONLY. Visitor counts require a real traffic-analytics tool (e.g.
   * Plausible/GA + an events table). The DB alone can never produce this.
   */
  visitorsThisMonth: number;
  conversionVisitorToAccountPct: number;
  conversionAccountToPayingPct: number;
  activeLearners7d: number;
  activeLearners30d: number;

  churnRatePct: number;
  arpuCents: number;
  ltvCents: number;
  refundsCount: number;
  refundsAmountCents: number;
};
