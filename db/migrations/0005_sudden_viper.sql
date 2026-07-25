CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"slug" text NOT NULL,
	"code" text,
	"icon" text,
	"category" text,
	"title_ht" text,
	"title_fr" text,
	"tagline_ht" text,
	"tagline_fr" text,
	"audience_ht" text,
	"audience_fr" text,
	"learn_ht" jsonb,
	"learn_fr" jsonb,
	"promise_ht" text,
	"promise_fr" text,
	"problem_ht" text,
	"problem_fr" text,
	"deliverables_ht" jsonb,
	"deliverables_fr" jsonb,
	"prereq_ht" jsonb,
	"prereq_fr" jsonb,
	"faq_ht" jsonb,
	"faq_fr" jsonb,
	"price_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"images" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by" text,
	"published_at" timestamp with time zone,
	"has_unpublished_changes" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_slug" text NOT NULL,
	"index" integer NOT NULL,
	"title_ht" text NOT NULL,
	"title_fr" text NOT NULL,
	"bunny_video_id" text,
	"duration_seconds" integer,
	"is_preview" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_course_slug_index_unique" UNIQUE("course_slug","index")
);
--> statement-breakpoint
CREATE TABLE "teacher_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"title_ht" text,
	"title_fr" text,
	"price_cents_monthly" integer,
	"includes_all" boolean DEFAULT true NOT NULL,
	"course_slugs" jsonb,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_slug_courses_slug_fk" FOREIGN KEY ("course_slug") REFERENCES "public"."courses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_plans" ADD CONSTRAINT "teacher_plans_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;