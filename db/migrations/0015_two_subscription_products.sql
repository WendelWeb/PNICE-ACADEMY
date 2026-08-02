-- Task: two subscription products (teacher catalogue vs PNICE all-access).
-- platform_pass_usd_cents: the owner-set price of the "Pass PNICE" all-access
-- pass (lib/platformPrice.ts). Default 7900 ($79.00) matches the previous
-- hardcoded constant, so behaviour is unchanged until the owner edits it.
-- subscriptions.kind: 'teacher' | 'platform'. BACKFILL — every existing row
-- (including rows that already carry a teacher_plan_id from the earlier
-- per-teacher-checkout task) becomes 'platform': a subscriber who was
-- already paying is grandfathered into all-access rather than retroactively
-- locked out of courses they could browse yesterday. Only a subscription
-- created after this migration can ever be 'teacher' (see
-- lib/learner/access.ts's BINDING model header).
ALTER TABLE "platform_settings" ADD COLUMN "platform_pass_usd_cents" integer DEFAULT 7900 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "kind" text DEFAULT 'platform' NOT NULL;