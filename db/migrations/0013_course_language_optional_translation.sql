ALTER TABLE "courses" ADD COLUMN "primary_locale" text DEFAULT 'ht' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "bilingual" boolean DEFAULT true NOT NULL;