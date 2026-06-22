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

/** The five payment rails the platform will support (see Phase 2 schema). */
export type PaymentMethod = 'moncash' | 'natcash' | 'card' | 'paypal' | 'crypto';
export type PaymentStatus = 'succeeded' | 'failed' | 'refunded';
export type ProductType = 'course' | 'subscription';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due';

/* -------------------------------------------------------------------------- */
/* Domain entities (one type per domain — users, payments, courses, …)        */
/* -------------------------------------------------------------------------- */

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  country: Country;
  city: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Subscription (=9) or count of à-l'unité courses owned. */
  coursesOwned: number;
  isSubscriber: boolean;
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
};

export type AdminSubscription = {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  startedAt: string;
  /** ISO timestamp when canceled, or null if still active/past_due. */
  canceledAt: string | null;
  amountCents: number;
};

export type AdminEnrollment = {
  userId: string;
  courseSlug: string;
  enrolledAt: string;
};

export type AdminCertificate = {
  id: string;
  userId: string;
  courseSlug: string;
  issuedAt: string;
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
};

/* -------------------------------------------------------------------------- */
/* KPI overview (Tasks 5–8)                                                    */
/* -------------------------------------------------------------------------- */

export type KpiOverview = {
  /** Currency of every *Cents field below. */
  currency: 'USD';

  /* Task 5 — volumes & revenue */
  totalUsers: number;
  activeSubscribers: number;
  mrrCents: number;
  totalRevenueCents: number;
  revenueThisMonthCents: number;

  /* Task 6 — growth */
  newUsersToday: number;
  newUsers7d: number;
  newUsers30d: number;
  newEnrollmentsToday: number;
  newEnrollments7d: number;
  newEnrollments30d: number;

  /* Task 7 — conversion & engagement */
  /**
   * MOCK ONLY. Visitor counts require a real traffic-analytics tool (e.g.
   * Plausible/GA + an events table). The DB alone can never produce this — it
   * has no record of anonymous visits. Replace with real data later.
   */
  visitorsThisMonth: number;
  /** MOCK — derived from the mock visitor count above. */
  conversionVisitorToAccountPct: number;
  /** Real-ish: paying users / total accounts. */
  conversionAccountToPayingPct: number;
  activeLearners7d: number;
  activeLearners30d: number;

  /* Task 8 — retention & risk */
  churnRatePct: number;
  arpuCents: number;
  ltvCents: number;
  refundsCount: number;
  refundsAmountCents: number;
};

/* -------------------------------------------------------------------------- */
/* The data contract                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every screen talks to the admin through this interface. Lot 1 only needs the
 * KPI overview; later lots add getUsers / getPayments / … here, and both the
 * mock and the real implementation satisfy the same contract.
 */
export interface AdminDataSource {
  getKpiOverview(): Promise<KpiOverview>;
}
