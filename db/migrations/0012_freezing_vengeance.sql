ALTER TABLE "teacher_profiles" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_slug_unique" UNIQUE("slug");