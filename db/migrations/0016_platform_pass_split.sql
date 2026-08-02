-- Task: pro-rata split of PNICE all-access revenue (follow-up to Task: two
-- subscription products, db/migrations/0015 — closes the SEAM documented in
-- lib/teacher/earnings.ts's header: a 'platform' subscription sale is never
-- attributed to one teacher at sale time).
--
-- platform_pass_periods: one row per calendar month ('YYYY-MM') — the pool
-- accounting (this month's own 70% share, carry-in from an earlier
-- zero-consumption month, total, distributed, carry-out). UNIQUE(period):
-- re-running an already-computed period is a no-op that returns the
-- persisted row, never recomputes/double-carries.
--
-- platform_pass_splits: one row per (teacher, period) — UNIQUE(teacher_user_id,
-- period), the idempotency guard the task specifically asked for, mirroring
-- earnings_ledger's own sale-per-payment unique index.
--
-- earnings_ledger.platform_pass_split_id + earnings_ledger_platform_pass_split_uniq:
-- links each teacher's credited share back to its split row, with the SAME
-- partial-unique-index + onConflictDoNothing pattern as
-- earnings_ledger_sale_payment_uniq — belt-and-suspenders alongside
-- platform_pass_splits' own uniqueness. earnings_ledger.kind's TS union also
-- gains 'platform_pass' (db/schema.ts) — the column itself is plain `text`,
-- no DB-level CHECK constraint, so that widening needs no SQL here.
CREATE TABLE "platform_pass_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"gross_cents" integer NOT NULL,
	"commission_pct_applied" integer NOT NULL,
	"own_pool_cents" integer NOT NULL,
	"carry_in_cents" integer NOT NULL,
	"total_pool_cents" integer NOT NULL,
	"consumption_total" integer NOT NULL,
	"distributed_cents" integer NOT NULL,
	"carry_out_cents" integer NOT NULL,
	"computed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_pass_periods_period_unique" UNIQUE("period")
);
--> statement-breakpoint
CREATE TABLE "platform_pass_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"completions" integer NOT NULL,
	"share_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_pass_splits_teacher_period_uniq" UNIQUE("teacher_user_id","period")
);
--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD COLUMN "platform_pass_split_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_pass_splits" ADD CONSTRAINT "platform_pass_splits_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_platform_pass_split_id_platform_pass_splits_id_fk" FOREIGN KEY ("platform_pass_split_id") REFERENCES "public"."platform_pass_splits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "earnings_ledger_platform_pass_split_uniq" ON "earnings_ledger" USING btree ("platform_pass_split_id") WHERE "earnings_ledger"."platform_pass_split_id" IS NOT NULL AND "earnings_ledger"."kind" = 'platform_pass';