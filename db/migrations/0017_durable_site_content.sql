-- Stage: durable site content (feat/site) — the in-memory site store
-- (lib/admin/site/store.ts) becomes DB-backed: legal pages, testimonials and
-- testimonial-request tokens survive deploys and stop diverging per
-- serverless instance.
--
-- BACKFILL: none needed — empty tables mean "fall back to the code defaults".
--   * site_legal_pages: a missing row (or a blank language column) renders the
--     complete code-shipped policy from data/legal.ts for that language; the
--     first admin save from /admin/contenu upserts one CURRENT row per slug.
--   * site_testimonials: only REAL ('real'/'published') testimonials live
--     here. The example placeholders stay virtual code-side rows
--     (data/testimonials.ts) that can never be published or persisted.
--   * site_review_tokens: starts empty; rows are created on demand by
--     "request a testimonial" and consumed single-use by /temoignage/[token].
--
-- The payment-provider toggles + maintenance flag need NO new columns:
-- platform_settings has carried providers_json, maintenance_enabled and
-- maintenance_message_ht/fr since migration 0001 — they were simply never
-- read or written until now. lib/admin/platform/store.ts starts using them
-- with lib/fx.ts's exact pattern (gated never-throw read of the 'singleton'
-- row, insert-or-onConflictDoUpdate write). A NULL providers_json means
-- "all toggles on" (the code default), same fallback philosophy as above.
CREATE TABLE "site_legal_pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"content_ht" text DEFAULT '' NOT NULL,
	"content_fr" text DEFAULT '' NOT NULL,
	"admin_name" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_review_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_testimonials" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"course_slug" text,
	"quote_ht" text DEFAULT '' NOT NULL,
	"quote_fr" text DEFAULT '' NOT NULL,
	"photo" text,
	"status" text DEFAULT 'real' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
