CREATE TABLE "bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title_ht" text,
	"title_fr" text,
	"course_slugs" jsonb,
	"price_cents" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_slug" text NOT NULL,
	"user_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_reviews_course_slug_user_id_unique" UNIQUE("course_slug","user_id")
);
--> statement-breakpoint
CREATE TABLE "earnings_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"payment_id" uuid,
	"kind" text NOT NULL,
	"gross_cents" integer NOT NULL,
	"commission_pct_applied" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text,
	"bio_ht" text,
	"bio_fr" text,
	"photo_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_method" text,
	"payout_destination" text,
	"video_quota_minutes" integer,
	"terms_accepted_at" timestamp with time zone,
	"review_note" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text,
	"destination_snapshot" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_by" text,
	"processed_at" timestamp with time zone,
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "commission_pct" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "payout_threshold_cents" integer DEFAULT 2500 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "default_video_quota_minutes" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_course_slug_courses_slug_fk" FOREIGN KEY ("course_slug") REFERENCES "public"."courses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_teacher_user_id_users_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;