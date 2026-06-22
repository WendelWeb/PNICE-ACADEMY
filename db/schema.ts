import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
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
  phone: text('phone'),
  localePref: text('locale_pref').$type<'fr' | 'ht'>().default('ht'),
  country: text('country'),
  referralCode: text('referral_code').unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subscriptions = pgTable('subscriptions', {
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
});

export const payments = pgTable('payments', {
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
});

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
  discountValue: integer('discount_value').notNull(),
  appliesTo: text('applies_to')
    .$type<'subscription' | 'course' | 'all'>()
    .notNull(),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
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
  type: text('type').$type<'question' | 'bug' | 'refund'>().notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status')
    .$type<'open' | 'in_progress' | 'resolved'>()
    .default('open')
    .notNull(),
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
