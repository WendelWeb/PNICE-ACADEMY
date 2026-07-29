CREATE TABLE "course_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_slug" text NOT NULL,
	"index" integer NOT NULL,
	"title_ht" text NOT NULL,
	"title_fr" text NOT NULL,
	"summary_ht" text,
	"summary_fr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_chapters_course_slug_index_unique" UNIQUE("course_slug","index")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "resources" jsonb;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "chapter_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "notes_ht" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "notes_fr" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "resources" jsonb;--> statement-breakpoint
ALTER TABLE "course_chapters" ADD CONSTRAINT "course_chapters_course_slug_courses_slug_fk" FOREIGN KEY ("course_slug") REFERENCES "public"."courses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."course_chapters"("id") ON DELETE set null ON UPDATE no action;