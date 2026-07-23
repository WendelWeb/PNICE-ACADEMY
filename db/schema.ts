import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * PNICE Academy — Drizzle/Neon schema (Phase 2 foundation).
 *
 * DECISIONS (documented because the source prompt assumed a prior "Phase 2 Lot 1"
 * that was never built — this file creates everything from scratch):
 * - Course/lesson CONTENT stays in code (data/courses.ts — the 9 fixed formations).
 *   DB rows reference a course by `course_slug` (text) and a lesson by `lesson_index`
 *   (int), instead of a `courses`/`lessons` FK. Avoids seeding/syncing static content.
 * - `referral_code` lives on `users` (single source of truth, per prompt G1).
 * - Access to a course = an active `subscriptions` row OR an `enrollments` row.
 * - Credit balance is NOT denormalised — compute SUM(amount_cents) over credit_ledger.
 * - Money is stored in cents (int) + currency; HTG is derived at the configured rate.
 * - Nothing migrates until DATABASE_URL is set (see db/index.ts, drizzle.config.ts).
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  // Display name + the name printed on certificates (synced from Clerk).
  name: text('name'),
  certificateName: text('certificate_name'),
  phone: text('phone'),
  localePref: text('locale_pref').$type<'fr' | 'ht'>().default('ht'),
  country: text('country'),
  city: text('city'),
  // Admin-controlled account state (Clerk ban mirrored here for the admin list).
  status: text('status').$type<'active' | 'suspended' | 'banned'>().default('active').notNull(),
  referralCode: text('referral_code').unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status')
      .$type<'active' | 'past_due' | 'canceled' | 'incomplete'>()
      .notNull(),
    // recurring only on card/PayPal/Stripe; crypto = manual monthly renewal (B1)
    provider: text('provider').$type<'stripe' | 'paypal' | 'crypto'>().notNull(),
    providerRef: text('provider_ref'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Postgres allows multiple NULLs in a unique column, so legacy/manual
    // rows without a providerRef are unaffected.
    uniqProviderRef: unique().on(t.providerRef),
  }),
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider')
      .$type<'stripe' | 'paypal' | 'moncash' | 'natcash' | 'crypto'>()
      .notNull(),
    providerRef: text('provider_ref'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    status: text('status')
      .$type<'pending' | 'completed' | 'failed' | 'refunded'>()
      .notNull()
      .default('pending'),
    productType: text('product_type').$type<'course' | 'subscription'>().notNull(),
    courseSlug: text('course_slug'),
    relatedSubscriptionId: uuid('related_subscription_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Postgres allows multiple NULLs in a unique column, so legacy/manual
    // rows without a providerRef are unaffected.
    uniqProviderRef: unique().on(t.provider, t.providerRef),
  }),
);

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  courseSlug: text('course_slug').notNull(),
  status: text('status').$type<'active' | 'refunded'>().notNull().default('active'),
  relatedPaymentId: uuid('related_payment_id').references(() => payments.id, {
    onDelete: 'set null',
  }),
  purchasedAt: timestamp('purchased_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const progress = pgTable(
  'progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseSlug: text('course_slug').notNull(),
    lessonIndex: integer('lesson_index').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    lastPositionSeconds: integer('last_position_seconds').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqLesson: unique().on(t.userId, t.courseSlug, t.lessonIndex),
  }),
);

export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  courseSlug: text('course_slug').notNull(),
  certificateName: text('certificate_name').notNull(),
  verificationCode: text('verification_code').notNull().unique(),
  issuedAt: timestamp('issued_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  pdfUrl: text('pdf_url'),
});

export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').$type<'percent' | 'fixed'>().notNull(),
  // percent: 1–100. fixed: USD cents.
  discountValue: integer('discount_value').notNull(),
  appliesTo: text('applies_to')
    .$type<'subscription' | 'course' | 'all'>()
    .notNull(),
  // Set only when applies_to = 'course'.
  courseSlug: text('course_slug'),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  // Scheduled activation; null = active immediately.
  startsAt: timestamp('starts_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const promoRedemptions = pgTable('promo_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  promoCodeId: uuid('promo_code_id')
    .notNull()
    .references(() => promoCodes.id, { onDelete: 'cascade' }),
  relatedPaymentId: uuid('related_payment_id').references(() => payments.id, {
    onDelete: 'set null',
  }),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const creditLedger = pgTable('credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // positive = credit added, negative = credit spent
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason')
    .$type<'referral' | 'promo' | 'refund' | 'manual'>()
    .notNull(),
  relatedId: uuid('related_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailNewCourses: boolean('email_new_courses').default(true).notNull(),
  emailPromos: boolean('email_promos').default(true).notNull(),
  emailReceipts: boolean('email_receipts').default(true).notNull(),
  emailReminders: boolean('email_reminders').default(true).notNull(),
  whatsappEnabled: boolean('whatsapp_enabled').default(false).notNull(),
  whatsappReminders: boolean('whatsapp_reminders').default(true).notNull(),
  reminderFrequency: text('reminder_frequency')
    .$type<'daily' | 'every3days' | 'weekly' | 'never'>()
    .default('weekly')
    .notNull(),
  newsletter: boolean('newsletter').default(true).notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 'other' covers system-generated tickets (e.g. the /enseigner « Mwen enterese »
  // interest capture) — no schema change, just a wider allowed string.
  type: text('type').$type<'question' | 'bug' | 'refund' | 'other'>().notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status')
    .$type<'open' | 'in_progress' | 'resolved'>()
    .default('open')
    .notNull(),
  // Clerk user id of the admin handling the ticket (admins are Clerk accounts,
  // not rows in `users`), plus a denormalised name for display.
  assignedAdminId: text('assigned_admin_id'),
  assignedAdminName: text('assigned_admin_name'),
  relatedPaymentId: uuid('related_payment_id').references(() => payments.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* -------------------------------------------------------------------------- */
/* Phase D tables (marketing + support + système) — added in Phase D lots so   */
/* `realDataSource()` has a home for every mock entity. Money in cents.        */
/* -------------------------------------------------------------------------- */

/** Reply thread on a support ticket (Phase D Lot 2). */
export const supportReplies = pgTable('support_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorType: text('author_type').$type<'user' | 'admin'>().notNull(),
  // Clerk id (admin) or users.id (learner) — kept as text to cover both.
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Canned bilingual support replies (Phase D Lot 2, Task 4). */
export const supportTemplates = pgTable('support_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: text('category').notNull(),
  titleHt: text('title_ht').notNull(),
  titleFr: text('title_fr').notNull(),
  bodyHt: text('body_ht').notNull(),
  bodyFr: text('body_fr').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Internal admin notifications — sales + critical events (Phase D Lot 2). */
export const adminNotifications = pgTable('admin_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind')
    .$type<'sale' | 'payment_failed' | 'refund_request' | 'sub_canceled' | 'webhook_error'>()
    .notNull(),
  severity: text('severity').$type<'info' | 'critical'>().notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  userName: text('user_name'),
  amountCents: integer('amount_cents'),
  detail: text('detail'),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Inbound payment-provider webhooks + processing status (Phase D Lot 2, Task 7). */
export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload'),
  status: text('status')
    .$type<'processed' | 'failed' | 'ignored'>()
    .notNull(),
  errorMessage: text('error_message'),
  providerRef: text('provider_ref'),
  receivedAt: timestamp('received_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  retryCount: integer('retry_count').default(0).notNull(),
});

/** Grouped application errors (Phase D Lot 2, Task 9). `fingerprint` groups
 *  identical message+route; `count` increments on repeat. */
export const errorLogs = pgTable('error_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  fingerprint: text('fingerprint').notNull().unique(),
  message: text('message').notNull(),
  stackTruncated: text('stack_truncated'),
  route: text('route'),
  count: integer('count').default(1).notNull(),
  firstAt: timestamp('first_at', { withTimezone: true }).defaultNow().notNull(),
  lastAt: timestamp('last_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Abandoned-cart detection (Phase D Lot 1, Tasks 6–7). */
export const checkoutSessions = pgTable('checkout_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // null for not-logged-in visitors (no email → no relance).
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  sessionId: text('session_id'),
  productType: text('product_type').$type<'course' | 'subscription'>().notNull(),
  courseSlug: text('course_slug'),
  amountCents: integer('amount_cents').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  // Filled by the 2h cron when a session never completes.
  abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
});

/** First-touch UTM attribution per user (Phase D Lot 1, Task 5). Captured once. */
export const userAcquisition = pgTable('user_acquisition', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Admin action audit trail (who / what / on whom / when). targetUserId is text
 *  because a target can be a learner (users.id), a Clerk admin id, or self. */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: text('admin_id').notNull(),
  adminName: text('admin_name').notNull(),
  action: text('action').notNull(),
  targetUserId: text('target_user_id'),
  detail: text('detail'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Platform settings — single-row table for mutable business config that must
 *  not live in env (referral credit, subscription price, daily-digest, etc.). */
export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey().default('singleton'),
  subscriptionUsdCents: integer('subscription_usd_cents').notNull(),
  referralCreditCents: integer('referral_credit_cents').default(500).notNull(),
  providersJson: jsonb('providers_json'),
  maintenanceEnabled: boolean('maintenance_enabled').default(false).notNull(),
  maintenanceMessageHt: text('maintenance_message_ht').default('').notNull(),
  maintenanceMessageFr: text('maintenance_message_fr').default('').notNull(),
  fxRateHtg: integer('fx_rate_htg'),
  dailyDigestEnabled: boolean('daily_digest_enabled').default(true).notNull(),
  dailyDigestHour: integer('daily_digest_hour').default(8).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerUserId: uuid('referrer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  referredUserId: uuid('referred_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  referralCode: text('referral_code').notNull(),
  status: text('status').$type<'pending' | 'confirmed'>().default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export const cookieConsents = pgTable('cookie_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  sessionId: text('session_id'),
  essential: boolean('essential').default(true).notNull(),
  analytics: boolean('analytics').default(false).notNull(),
  marketing: boolean('marketing').default(false).notNull(),
  consentedAt: timestamp('consented_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
