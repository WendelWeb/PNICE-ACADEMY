# C2 — Cours & leçons en base de données (marketplace-ready) — Plan

> Execute with subagent-driven-development. C2 is the prerequisite for C3 (teacher studio): courses must live in the DB with an owner before teachers can create them. Implementers read this whole file + the spec docs/superpowers/specs/2026-07-22-marketplace-design.md §2(C2)/§3.

**Goal:** move the 9 courses + their lessons from static `data/courses.ts`/`data/courseDetails.ts` into Postgres, owned by teacher #1 (the owner's user), with a status lifecycle — so the public site, the learner pages, and the admin CMS all read/write real DB rows, and C3's teacher studio has a table to write to. The $79 subscription becomes a seeded `teacher_plan`.

## Key engineering decision (deviation from spec, deliberate, lower-risk)
The spec proposed `course_slug → course_id` FK across enrollments/payments/certificates/progress. **We keep `course_slug` as the stable key.** The entire money path already runs on slug and is tested/working; re-keying it is high-risk for zero marketplace benefit. Instead: `courses.slug` is the natural key (unique), `lessons.course_slug` FKs to it, and enrollments/payments/progress/certificates stay on `course_slug` UNCHANGED. Marketplace properties (owner per course, DB-backed, teacher-editable, status lifecycle) are fully achieved. Document this in the schema header.

## Global constraints
- Money path FROZEN: enrollments/payments/progress/certificates keep `course_slug`; lib/payments/fulfill.ts + lib/learner/access.ts logic unchanged except that "course exists / lesson count / title" lookups shift from `data/courses.ts` to the new DB-backed course source (behind a data-access module, gated).
- **Env-gated**: no DATABASE_URL ⇒ the course source falls back to the static `data/courses.ts` seed data, so dev/mock/build never breaks. The static files REMAIN in the repo as the seed source + fallback.
- New DB tables need `db:push` on the live DB to be testable — the owner applies migrations, but generate them offline (`db:generate`) and commit SQL+meta. Where a task needs the tables live to verify, note it; a throwaway `db:push`-then-verify is acceptable ONLY if explicitly done by the controller, else defer live verification.
- Bilingual ht/fr, `npm run check:i18n` exit 0; `tsc`/`build`/`test` green each task.
- No new runtime deps. Commit footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Tables (new)
- **`courses`**: id uuid pk; `owner_user_id` uuid FK users(id); `slug` text unique notNull; `code` text; `icon` text; bilingual `title_ht/fr`, `tagline_ht/fr`, `audience_ht/fr`; `learn_ht/fr` jsonb (string[]); sales-page bilingual fields `promise_ht/fr`, `problem_ht/fr`, `deliverables_ht/fr` (jsonb), `prereq_ht/fr`, `faq_ht/fr` (jsonb of {q,a}); `price_cents` int; `currency` text default 'USD'; `category` text; `images` jsonb (main + secondary); `status` text ('draft'|'pending_review'|'published'|'rejected'|'archived') default 'draft'; `review_note` text; `submitted_at`/`reviewed_by`/`published_at` ts; `has_unpublished_changes` bool default false; `created_at`/`updated_at`.
- **`lessons`**: id uuid pk; `course_slug` text FK courses(slug) onDelete cascade; `index` int; `title_ht/fr` text; `bunny_video_id` text; `duration_seconds` int; `is_preview` bool default false; unique(course_slug, index); `created_at`/`updated_at`.
- **`teacher_plans`**: id uuid pk; `owner_user_id` uuid FK users(id); `title_ht/fr` text; `price_cents_monthly` int; `includes_all` bool default true; `course_slugs` jsonb (used when !includes_all); `stripe_product_id`/`stripe_price_id` text; `status` text ('active'|'inactive') default 'active'; `created_at`/`updated_at`.

## Tasks

**C2-T1 — Schema + DB course source (read).**
- Add the 3 tables to db/schema.ts (with the slug-key decision documented). `npm run db:generate` (offline) → new migration + meta, commit all.
- `lib/courses/source.ts` — the single course data-access module. `getAllCourses()`, `getCourseBySlug(slug)`, `getLessons(slug)`, `getPublishedCourses()`, mapping DB rows → the SAME `Course`/lesson shape the app already consumes (so consumers barely change). **Gated**: if no DATABASE_URL OR the courses table is empty/unreachable, fall back to the static `data/courses.ts` + `data/courseDetails.ts` (import them as the seed/fallback). Never throw. This is what lets the app keep working pre-seed and in dev.
- Unit test the mapping (DB row shape → Course shape) + the fallback path.
- Accept: tsc green; the module returns the 9 static courses today (fallback, since DB tables are empty/unmigrated), identical shape to data/courses.ts.

**C2-T2 — Seed script (static → DB).**
- `scripts/seed-courses.ts` (dotenv-first): reads data/courses.ts + data/courseDetails.ts, resolves the owner's users.id (the synced Clerk owner — by ADMIN_BOOTSTRAP_EMAILS or the single existing user), upserts each of the 9 courses (status='published', owner=owner) + their lessons + the $79 teacher_plan (owner, includes_all). Idempotent (onConflict by slug). `npm run db:seed-courses`.
- This REQUIRES the C2-T1 tables applied to the live DB (`db:push`). The controller decides whether to run db:push+seed live now or defer to the owner; either way the script is written + dry-run/typecheck verified.
- Accept: script typechecks + runs (against live DB if applied); post-seed, `lib/courses/source.ts` returns the DB rows (not the fallback) with identical content to the static data.

**C2-T3 — Public site + learner pages read from DB.**
- Replace `@/data/courses` imports in the public/learner/home surfaces with `lib/courses/source.ts`: /formations (catalog), /formations/[slug] (sales page), /tableau-de-bord + lesson pages, home (featured/MarketplaceBar/TeacherSpotlight), data/teachers.ts course resolution, CourseCardGrid/CourseCatalogCard. Only PUBLISHED courses show publicly; the owner's own draft/pending are hidden from public.
- The pages that were static (SSG) may need `dynamic`/revalidate since course data is now DB-backed — choose per page (catalog/sales can use revalidate; keep it sane). Preserve U4 search/sort/category (now over DB courses), the learner access gate (still slug-based), and the marketplace framing.
- Accept: with the DB seeded, the public site + learner flow render identically from the DB; with no DB (fallback), still render from static data; build green; check:i18n green.

**C2-T4 — Admin CMS → DB.**
- Point the admin CMS (lib/admin/content/ store + the /admin/cours pages: list, nouveau, editer, apercu, publish) at the DB via the course source + new write ops (create/update course, add/reorder/delete lessons, publish/unpublish, images) writing real rows + audit_log. The status lifecycle (draft→pending_review→published) is wired here (owner can publish own courses directly for now; the review QUEUE is C3). Retire the in-memory content store.
- Accept: admin can create/edit/publish a course that then appears on the public site (real end-to-end), audited; tsc/build/test green.

**C2-T5 — Cutover + verify + review.**
- Remove now-dead static reads (keep data/courses.ts only as the seed source referenced by scripts/seed-courses.ts + the source-module fallback). Verify enrollments/certificates/fulfillment still resolve course titles/lesson counts via the new source (money path intact). Full gates + a whole-C2 review.
- Accept: no public/learner/admin surface reads static course data directly (all via lib/courses/source.ts); money path unaffected; gates green.

## Sequence
T1 (schema+source) → T2 (seed) → T3 (public reads) → T4 (CMS writes) → T5 (cutover+review). Then C3 (separate plan). Ledger: .superpowers/sdd/progress.md.
