/**
 * db/courses-compat.ts — tolerates a live DB that still lags migration 0022
 * (`courses.tags`) on the WRITE path of course creation.
 *
 * Same reality as db/checkout-compat.ts / db/payments-compat.ts, proven the
 * same way (`.toSQL()`): drizzle names EVERY schema column in every INSERT it
 * builds, supplying `default` for omitted keys — so the moment `tags` exists
 * in db/schema.ts, every insert into `courses` (the studio's « nouveau
 * cours » included, which never sends tags) references the column and fails
 * 42703 on a pre-0022 DB. Omitting the column from the SQL requires a table
 * object that does not know it exists. This is that object.
 *
 * Consumers: lib/courses/write.ts's `createCourse` insert fallback. The READ
 * side needs no twin — lib/courses/source.ts's selectors retry with an
 * explicit pre-0022 column projection instead (see `PRE_0022_COURSE_COLUMNS`
 * there), and UPDATEs only name the keys they are given, so a save that
 * carries no `tags` key is naturally compatible.
 */
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { CourseResource } from '@/db/schema';

/** `courses` as an un-migrated (pre-0022) production DB knows it. */
export const coursesPre0022 = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id'),
  slug: text('slug').notNull().unique(),
  code: text('code'),
  icon: text('icon'),
  category: text('category').$type<'biznis' | 'dijital' | 'lajan' | 'lavi-pratik'>(),
  primaryLocale: text('primary_locale').$type<'ht' | 'fr'>().default('ht').notNull(),
  bilingual: boolean('bilingual').default(true).notNull(),
  titleHt: text('title_ht'),
  titleFr: text('title_fr'),
  taglineHt: text('tagline_ht'),
  taglineFr: text('tagline_fr'),
  audienceHt: text('audience_ht'),
  audienceFr: text('audience_fr'),
  learnHt: jsonb('learn_ht').$type<string[]>(),
  learnFr: jsonb('learn_fr').$type<string[]>(),
  levelHt: text('level_ht'),
  levelFr: text('level_fr'),
  promiseHt: text('promise_ht'),
  promiseFr: text('promise_fr'),
  problemHt: text('problem_ht'),
  problemFr: text('problem_fr'),
  deliverablesHt: jsonb('deliverables_ht').$type<string[]>(),
  deliverablesFr: jsonb('deliverables_fr').$type<string[]>(),
  prereqHt: jsonb('prereq_ht').$type<string[]>(),
  prereqFr: jsonb('prereq_fr').$type<string[]>(),
  faqHt: jsonb('faq_ht').$type<{ q: string; a: string }[]>(),
  faqFr: jsonb('faq_fr').$type<{ q: string; a: string }[]>(),
  priceCents: integer('price_cents'),
  currency: text('currency').default('USD').notNull(),
  images: jsonb('images').$type<{ main?: string; secondary?: { url: string; alt: string }[] }>(),
  status: text('status')
    .$type<'draft' | 'pending_review' | 'published' | 'rejected' | 'archived'>()
    .default('draft')
    .notNull(),
  reviewNote: text('review_note'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedBy: text('reviewed_by'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  hasUnpublishedChanges: boolean('has_unpublished_changes').default(false).notNull(),
  resources: jsonb('resources').$type<CourseResource[]>(),
  bunnyCollectionId: text('bunny_collection_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
