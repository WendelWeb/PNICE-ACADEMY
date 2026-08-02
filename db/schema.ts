import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
    // Which teacher_plans row this subscription is for (Task: per-teacher
    // subscription checkout). No `.references()` — same soft-reference
    // pattern as `payments.related_subscription_id` below, chosen because
    // `teacher_plans` is declared much later in this file and the codebase's
    // convention (see `lessons.chapter_id`'s comment) is to only ever FK a
    // table already declared above. Nullable: legacy rows created before
    // this task, and the platform-default checkout path when no specific
    // plan could be resolved (see lib/payments/products.ts), have none —
    // access stays platform-wide regardless (see lib/learner/access.ts's
    // BINDING model), this column exists ONLY so the earnings ledger can
    // credit the RIGHT teacher's 70% instead of guessing "the first active
    // plan" (lib/teacher/earnings.ts's `resolveTeacherUserId`).
    teacherPlanId: uuid('teacher_plan_id'),
    // Task: two subscription products (teacher catalogue vs PNICE all-access).
    // Explicit column — deliberately NOT inferred from `teacherPlanId` being
    // null/set (see lib/learner/access.ts's BINDING model header for why):
    // 'teacher' = access to ONE teacher's published courses only (that
    // teacher's own `teacher_plans` price, 70% credited to them at sale —
    // lib/teacher/earnings.ts); 'platform' = every published course, priced
    // by the OWNER (lib/platformPrice.ts), whose 70% is NOT attributed to any
    // single teacher (accrues for a later pro-rata split — follow-up task).
    // BACKFILL: every row that predates this column defaults to 'platform' —
    // including rows that already carry a `teacherPlanId` from the earlier
    // per-teacher-checkout task. This is deliberate, not an oversight: a
    // subscriber who was already paying is grandfathered into all-access
    // rather than being retroactively locked out of courses they could
    // browse yesterday. Only a subscription created AFTER this column exists
    // can ever be 'teacher'.
    kind: text('kind').$type<'teacher' | 'platform'>().default('platform').notNull(),
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

export const certificates = pgTable(
  'certificates',
  {
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
    revoked: boolean('revoked').default(false).notNull(),
  },
  (t) => ({
    uniqUserCourse: unique().on(t.userId, t.courseSlug),
  }),
);

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
  // Task: two subscription products — the OWNER-set price of the "Pass
  // PNICE" all-access pass (lib/platformPrice.ts's getPlatformPassPriceCents/
  // setPlatformPassPriceCents, mirroring fxRateHtg below exactly: gated read,
  // non-positive/missing ⇒ fall back to the SUBSCRIPTION_USD constant).
  // Default 7900 ($79.00) = the constant's value, so behaviour is UNCHANGED
  // until the owner edits it from /admin/prix. Distinct from the legacy
  // `subscriptionUsdCents` column above, which is written but never read as
  // a price source (see lib/fx.ts's header) — kept as-is, untouched.
  platformPassUsdCents: integer('platform_pass_usd_cents').default(7900).notNull(),
  referralCreditCents: integer('referral_credit_cents').default(500).notNull(),
  providersJson: jsonb('providers_json'),
  maintenanceEnabled: boolean('maintenance_enabled').default(false).notNull(),
  maintenanceMessageHt: text('maintenance_message_ht').default('').notNull(),
  maintenanceMessageFr: text('maintenance_message_fr').default('').notNull(),
  fxRateHtg: integer('fx_rate_htg'),
  dailyDigestEnabled: boolean('daily_digest_enabled').default(true).notNull(),
  dailyDigestHour: integer('daily_digest_hour').default(8).notNull(),
  // C3 marketplace settings (Task C3-T1) — see docs/superpowers/specs/2026-07-22-marketplace-design.md §3/§4.
  commissionPct: integer('commission_pct').default(30).notNull(),
  payoutThresholdCents: integer('payout_threshold_cents').default(2500).notNull(),
  defaultVideoQuotaMinutes: integer('default_video_quota_minutes').default(600).notNull(),
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

/* -------------------------------------------------------------------------- */
/* Phase C2 — Courses & lessons in the DB (marketplace-ready).                */
/*                                                                            */
/* KEY DECISION (deviation from the original marketplace spec, deliberate —   */
/* see docs/superpowers/plans/2026-07-24-c2-courses-to-db.md): enrollments /  */
/* payments / progress / certificates keep `course_slug` (text) as their key,      */
/* UNCHANGED. We do NOT re-key that already-tested money path to a           */
/* `course_id` FK. Instead `courses.slug` is the natural key (unique,        */
/* notNull) and `lessons.course_slug` FKs to it. This gives courses a real   */
/* DB home — an owner, editable content, a status lifecycle — the           */
/* marketplace needs, without touching the money path at all.               */
/*                                                                            */
/* Content/shape note: `data/courses.ts` (the `Course`/`Lesson` types) and    */
/* `data/courseDetails.ts` (`CourseDetail`, keyed by `code`) remain in the    */
/* repo as the seed source (scripts/seed-courses.ts, C2-T2) and as the       */
/* fallback `lib/courses/source.ts` uses when there's no DATABASE_URL or the  */
/* DB read fails/returns nothing (see that module's header). `prereq_ht/fr`   */
/* below is jsonb (string[]), not plain text, to preserve the shape of        */
/* `CourseDetail.requirements_ht/fr` — the plan's shorthand only annotated    */
/* `deliverables`/`faq` with "(jsonb)" but `prereq` is the same kind of list. */
/* -------------------------------------------------------------------------- */

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable + set-null (not cascade): losing the owner's user row must never
  // delete the course itself — enrollments/payments/progress/certificates
  // still key off `course_slug` and must keep resolving.
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  code: text('code'),
  // Tabler icon key, mapped in components/courses/CourseIcon.tsx.
  icon: text('icon'),
  category: text('category').$type<'biznis' | 'dijital' | 'lajan' | 'lavi-pratik'>(),
  // Optional course translation (Task: course-language): a teacher can author
  // a course in a SINGLE language instead of the mandatory ht+fr pair every
  // text field below implies. `bilingual=false` means every ht/fr pair is
  // MIRRORED (byte-identical in both columns) at write time — see
  // lib/courses/write.ts's `mirrorBilingualFields`, the ONE place this is
  // enforced — so every existing reader keeps working untouched and a
  // visitor browsing in the "other" locale still sees the course instead of
  // blanks. `primaryLocale` is which side is the source of truth to mirror
  // FROM. Defaults (`bilingual=true`, `primaryLocale='ht'`) keep the 9
  // existing courses — and every admin-CMS call site that doesn't pass these
  // — unchanged.
  primaryLocale: text('primary_locale').$type<'ht' | 'fr'>().default('ht').notNull(),
  bilingual: boolean('bilingual').default(true).notNull(),
  titleHt: text('title_ht'),
  titleFr: text('title_fr'),
  taglineHt: text('tagline_ht'),
  taglineFr: text('tagline_fr'),
  audienceHt: text('audience_ht'),
  audienceFr: text('audience_fr'),
  // Bullet points — mirrors data/courses.ts Course.learn_ht/fr (string[]).
  learnHt: jsonb('learn_ht').$type<string[]>(),
  learnFr: jsonb('learn_fr').$type<string[]>(),
  // Sales-page content (data/courseDetails.ts CourseDetail, keyed by `code` today).
  // levelHt/Fr close the C2-T3 schema gap (see lib/courses/source.ts's
  // mapDbCourseToDetail header): CourseDetail.level_ht/fr had no column until
  // Task C2-T4 — teacher-authored courses (C3) with no static counterpart
  // couldn't carry a level otherwise. Nullable; falls back to the static
  // data/courseDetails.ts entry (by `code`) when null.
  levelHt: text('level_ht'),
  levelFr: text('level_fr'),
  promiseHt: text('promise_ht'),
  promiseFr: text('promise_fr'),
  problemHt: text('problem_ht'),
  problemFr: text('problem_fr'),
  deliverablesHt: jsonb('deliverables_ht').$type<string[]>(),
  deliverablesFr: jsonb('deliverables_fr').$type<string[]>(),
  // See header note: jsonb string[], mirrors CourseDetail.requirements_ht/fr.
  prereqHt: jsonb('prereq_ht').$type<string[]>(),
  prereqFr: jsonb('prereq_fr').$type<string[]>(),
  faqHt: jsonb('faq_ht').$type<{ q: string; a: string }[]>(),
  faqFr: jsonb('faq_fr').$type<{ q: string; a: string }[]>(),
  priceCents: integer('price_cents'),
  currency: text('currency').default('USD').notNull(),
  // jsonb is untyped at the DB level — widening `secondary` to carry an `alt`
  // caption per image (Task C2-T4, needed by ImagesManager's existing alt-text
  // field) is a TS-only annotation change, no migration required.
  images: jsonb('images').$type<{ main?: string; secondary?: { url: string; alt: string }[] }>(),
  status: text('status')
    .$type<'draft' | 'pending_review' | 'published' | 'rejected' | 'archived'>()
    .default('draft')
    .notNull(),
  reviewNote: text('review_note'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  // Clerk id of the reviewing admin (admins are Clerk accounts, not `users` rows).
  reviewedBy: text('reviewed_by'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  hasUnpublishedChanges: boolean('has_unpublished_changes').default(false).notNull(),
  // Course-level links/downloads (Task K1 — plan de cours complet), rendered
  // in the sales-page description block ("lien en description"). Same shape
  // as lessons.resources below — see CourseResource's own doc comment.
  resources: jsonb('resources').$type<CourseResource[]>(),
  // Automatic Bunny organization (owner asked: "is it organized like Udemy,
  // is it all automatic?"): the Bunny Stream Collection GUID that groups
  // every video uploaded for this course, so the Bunny dashboard mirrors the
  // course catalog instead of one flat pile. Nullable — set the first time a
  // lesson video is uploaded for this course (see lib/bunny/collections.ts's
  // `ensureCourseCollection` + lib/bunny/organize.ts). Best-effort by design:
  // a course can stay `null` forever (no Bunny keys configured, or the
  // create/verify call failed) without blocking any upload.
  bunnyCollectionId: text('bunny_collection_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A course's parts/modules (Task K1 — plan de cours complet, see
 * docs/superpowers/plans/2026-07-28-course-curriculum.md). Purely additive:
 * `lessons.chapter_id` is nullable ("hors chapitre" = ungrouped), so a course
 * with zero rows here renders EXACTLY as it did before this table existed —
 * see lib/courses/source.ts's mapDbCourseToDetail. Defined before `lessons`
 * so `lessons.chapter_id`'s FK can reference it (matches this file's existing
 * convention of only ever forward-referencing an already-declared table).
 */
export const courseChapters = pgTable(
  'course_chapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseSlug: text('course_slug')
      .notNull()
      .references(() => courses.slug, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    titleHt: text('title_ht').notNull(),
    titleFr: text('title_fr').notNull(),
    // Optional short intro shown before the chapter's lesson list.
    summaryHt: text('summary_ht'),
    summaryFr: text('summary_fr'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqCourseIndex: unique().on(t.courseSlug, t.index),
  }),
);

/**
 * A link or downloadable file attached to a lesson (`lessons.resources`) or a
 * course (`courses.resources`) — Task K1. `url` MUST be validated http(s)-only
 * before it's ever written (see lib/courses/write.ts's `validateResources`,
 * mirroring lib/teacher/public.ts's `isSafePhotoUrl` allowlist) — teachers are
 * self-serve, so this is untrusted input reaching a public render.
 */
export type CourseResource = { label_ht: string; label_fr: string; url: string; kind: 'link' | 'file' };

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseSlug: text('course_slug')
      .notNull()
      .references(() => courses.slug, { onDelete: 'cascade' }),
    // Task K1 — which chapter this lesson belongs to. Nullable: null = "hors
    // chapitre" (ungrouped); set-null (not cascade) so deleting a chapter
    // NEVER deletes its lessons (lib/courses/write.ts's `deleteChapter`).
    chapterId: uuid('chapter_id').references(() => courseChapters.id, { onDelete: 'set null' }),
    index: integer('index').notNull(),
    titleHt: text('title_ht').notNull(),
    titleFr: text('title_fr').notNull(),
    // Per-lesson description (Task C2-T4, closes the C2-T3 schema gap — see
    // lib/courses/source.ts's mapDbCourseToDetail header): mirrors
    // data/courseDetails.ts's LessonDetail.desc_ht/fr, which had no column
    // until now. Nullable; falls back to the static entry when null.
    descHt: text('desc_ht'),
    descFr: text('desc_fr'),
    // Task K1 — long-form teacher notes/recap shown to the enrolled learner
    // under the video, distinct from the short desc_ht/fr above.
    notesHt: text('notes_ht'),
    notesFr: text('notes_fr'),
    // Task K1 — links + downloadable files attached to the lesson.
    resources: jsonb('resources').$type<CourseResource[]>(),
    // Bunny Stream video id (Task L4) — empty/undefined until the owner
    // records + uploads. Mirrors data/courses.ts Lesson.bunnyVideoId.
    bunnyVideoId: text('bunny_video_id'),
    durationSeconds: integer('duration_seconds'),
    isPreview: boolean('is_preview').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqCourseIndex: unique().on(t.courseSlug, t.index),
  }),
);

export const teacherPlans = pgTable('teacher_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  titleHt: text('title_ht'),
  titleFr: text('title_fr'),
  priceCentsMonthly: integer('price_cents_monthly'),
  includesAll: boolean('includes_all').default(true).notNull(),
  // Used only when includesAll is false — the subset of courses.slug the plan grants.
  courseSlugs: jsonb('course_slugs').$type<string[]>(),
  stripeProductId: text('stripe_product_id'),
  stripePriceId: text('stripe_price_id'),
  status: text('status').$type<'active' | 'inactive'>().default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/* -------------------------------------------------------------------------- */
/* Phase C3 — Teacher marketplace layer (schema + data-access foundation,     */
/* Task C3-T1). See docs/superpowers/plans/2026-07-24-c3-teacher-marketplace.md  */
/* + docs/superpowers/specs/2026-07-22-marketplace-design.md §3/§4.           */
/*                                                                            */
/* KEY DECISIONS:                                                            */
/* - `earnings_ledger.net_cents` is the ONLY source of a teacher's balance —  */
/*   `SUM(net_cents)` over their rows, never denormalised on teacher_profiles. */
/*   `commission_pct_applied` is frozen per-row at sale time (rate changes    */
/*   only affect future sales), per the spec's "commission figée à la vente". */
/* - `earnings_ledger.payment_id` is nullable (adjustments/manual ledger rows */
/*   have none) and FKs to `payments` with `onDelete: 'set null'` — deleting  */
/*   a payment record must never delete the earnings history.                */
/* - `course_reviews` keys off `courses.slug` (text), matching the C2 pattern */
/*   of keying by slug instead of a `course_id` FK (see courses table header). */
/*   The "reviewer must have an active enrollment" rule is enforced in code   */
/*   (server action), not the DB — mirrors how promo/referral rules aren't    */
/*   DB constraints either.                                                  */
/* - Nothing here is consumed yet: this task only adds schema + read helpers  */
/*   (lib/teacher/). Later C3 tasks (onboarding, studio, ledger writes,       */
/*   ratings) wire mutations against these tables. No money-path change.     */
/* -------------------------------------------------------------------------- */

export const teacherProfiles = pgTable('teacher_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Public /prof/[slug] URL segment (Task: DB-backed teacher slugs). Nullable
  // — a brand-new pending/rejected profile has none; generated (kebab-case
  // ASCII from display_name, deduped with a numeric suffix) the moment a
  // profile is APPROVED (lib/teacher/admin.ts's `approveTeacherProfile`), so
  // a 2nd+ real teacher gets a working public page with zero code change.
  // Unique so Postgres itself backstops the dedupe logic; multiple NULLs
  // (pending applicants) are allowed, same convention as `users.referral_code`.
  slug: text('slug').unique(),
  displayName: text('display_name'),
  bioHt: text('bio_ht'),
  bioFr: text('bio_fr'),
  photoUrl: text('photo_url'),
  status: text('status')
    .$type<'pending' | 'approved' | 'suspended' | 'rejected'>()
    .default('pending')
    .notNull(),
  payoutMethod: text('payout_method').$type<'moncash' | 'natcash' | 'paypal' | 'bank'>(),
  payoutDestination: text('payout_destination'),
  videoQuotaMinutes: integer('video_quota_minutes'),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  // Clerk id of the reviewing admin (admins are Clerk accounts, not `users` rows).
  reviewedBy: text('reviewed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const earningsLedger = pgTable(
  'earnings_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherUserId: uuid('teacher_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Nullable — adjustments/manual entries have no originating payment.
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    kind: text('kind').$type<'sale' | 'refund' | 'withdrawal' | 'adjustment'>().notNull(),
    grossCents: integer('gross_cents').notNull(),
    // Frozen at write time — see header note ("commission figée à la vente").
    commissionPctApplied: integer('commission_pct_applied').notNull(),
    commissionCents: integer('commission_cents').notNull(),
    // Negative for refund/withdrawal rows. Balance = SUM(net_cents), never denormalised.
    netCents: integer('net_cents').notNull(),
    currency: text('currency').default('USD').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Idempotency guard (Task C3-T5, lib/teacher/earnings.ts's `recordSaleEarning`):
    // Stripe's at-least-once webhook delivery must never produce a second
    // 'sale' row for the same payment — this partial unique index is the DB-
    // enforced backstop (the insert uses `.onConflictDoNothing()` against it).
    // Partial (kind='sale' only) because a refund row legitimately shares its
    // originating sale's payment_id (it reverses that exact row) and
    // withdrawal/adjustment rows have no payment_id at all — neither should
    // be constrained by this index.
    uniqSalePerPayment: uniqueIndex('earnings_ledger_sale_payment_uniq')
      .on(t.paymentId)
      .where(sql`${t.paymentId} IS NOT NULL AND ${t.kind} = 'sale'`),
  }),
);

export const withdrawalRequests = pgTable(
  'withdrawal_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherUserId: uuid('teacher_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    method: text('method'),
    destinationSnapshot: text('destination_snapshot'),
    status: text('status').$type<'pending' | 'paid' | 'rejected'>().default('pending').notNull(),
    // Clerk id of the admin who processed the request.
    processedBy: text('processed_by'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    reference: text('reference'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Race-condition guard (Task C3-T4 fix, withdrawal double-pending bug):
    // `requestWithdrawalAction` (lib/teacher/studio-actions.ts) does a
    // check-then-insert ("no existing pending row?") that is NOT atomic —
    // two concurrent requests can both pass that check and both insert,
    // producing two pending rows whose combined amount can exceed the
    // teacher's actual balance. A partial unique index makes Postgres the
    // real guard: at most one 'pending' row per teacher can ever exist,
    // full stop. The app-layer pre-checks stay (good UX / fast-path
    // rejection); this index is the backstop that makes them correct under
    // concurrency. A unique-violation on insert is caught by the action and
    // returned as `{ ok: false, message: 'pending_exists' }`.
    onePendingPerTeacher: uniqueIndex('withdrawal_one_pending_per_teacher')
      .on(t.teacherUserId)
      .where(sql`${t.status} = 'pending'`),
  }),
);

export const courseReviews = pgTable(
  'course_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseSlug: text('course_slug')
      .notNull()
      .references(() => courses.slug, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stars: integer('stars').notNull(),
    comment: text('comment'),
    status: text('status').$type<'published' | 'removed'>().default('published').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqCourseUser: unique().on(t.courseSlug, t.userId),
  }),
);

export const bundles = pgTable('bundles', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  titleHt: text('title_ht'),
  titleFr: text('title_fr'),
  courseSlugs: jsonb('course_slugs').$type<string[]>(),
  priceCents: integer('price_cents').notNull(),
  status: text('status').$type<'draft' | 'published' | 'archived'>().default('draft').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
