# C3 — Marketplace enseignants (couche multi-profs) — Plan

> Execute with subagent-driven-development. C3 turns the platform into a real multi-teacher marketplace: any account can apply to teach, get approved, run a studio, publish courses (admin-reviewed), and earn 70% with on-demand payouts. Builds on C2 (courses/lessons/teacher_plans in DB, `lib/courses/source.ts` + `write.ts`). Implementers read this + the spec docs/superpowers/specs/2026-07-22-marketplace-design.md (§C3 + §3 + §4 money flow).

**Goal:** teacher self-service end-to-end (apply → approve → studio → publish → earn → withdraw) + public teacher pages + course ratings — so other teachers can join before the owner records his own courses.

## Validated decisions (from the spec, binding)
- **Commission 30%** — teacher keeps 70%, frozen per-sale in `earnings_ledger` (each row stores the applied pct).
- **Payouts on-demand**, threshold **$25** (in platform_settings), manual admin queue (Stripe Connect unavailable in Haiti).
- **Moderation**: admin approves the teacher PROFILE before their first course; admin reviews EVERY course before publication (re-review on price/lesson changes).
- **Uniform**: owner = teacher #1; the $79 = his `teacher_plan` (seeded in C2). No special-casing.
- **Ratings v1**: a learner ENROLLED in a course can rate 1–5 + optional comment, one per learner per course, editable; instant publish; report → admin removal. Teacher rating = weighted average.
- **Rails v1 = card (Stripe) only** live; payouts paid manually via MonCash/NatCash/PayPal/bank (recorded, not automated).

## New tables (spec §3)
- **`teacher_profiles`**: user_id (FK unique), display_name, bio_ht/fr, photo_url, status ('pending'|'approved'|'suspended'|'rejected'), payout_method ('moncash'|'natcash'|'paypal'|'bank'), payout_destination, video_quota_minutes, terms_accepted_at, review_note, reviewed_by, timestamps.
- **`earnings_ledger`**: teacher_user_id, payment_id (nullable for adjustments), kind ('sale'|'refund'|'withdrawal'|'adjustment'), gross_cents, commission_pct_applied, commission_cents, net_cents (negative for refund/withdrawal), currency, note, created_at. **Balance = SUM(net_cents)** — never denormalized.
- **`withdrawal_requests`**: teacher_user_id, amount_cents, method, destination_snapshot, status ('pending'|'paid'|'rejected'), processed_by, processed_at, reference, note, timestamps.
- **`course_reviews`**: course_slug (FK courses.slug), user_id, stars (1–5), comment (nullable), status ('published'|'removed'), timestamps, unique(course_slug, user_id). Constraint enforced in code: reviewer must have an active enrollment.
- **`bundles`** (optional, may defer to a follow-up): owner_user_id, title_ht/fr, course_slugs jsonb, price_cents, status, timestamps.
- **platform_settings** extend: commission_pct (30), payout_threshold_cents (2500), default_video_quota_minutes.
- **courses**: teacher-authored courses set owner_user_id to the teacher; publish requires admin approval (status pending_review→published set by admin, not the teacher).

## Tasks

**C3-T1 — Schema + platform settings + data-access foundation.**
Add teacher_profiles, earnings_ledger, withdrawal_requests, course_reviews (+ bundles) to db/schema.ts; extend platform_settings (commission_pct, payout_threshold_cents, default_video_quota_minutes). `db:generate` (offline) migration + meta. New `lib/teacher/` module: read helpers gated + never-throw (getTeacherProfile(userId), isApprovedTeacher(userId), getTeacherBalanceCents(userId), getTeacherLedger, getWithdrawals) with static/empty fallback. Unit-test the pure bits.
*Accept: tsc/build/test green; helpers return empty/false without DB.*

**C3-T2 — Teacher onboarding (apply → pending).**
Public flow: "Devenir enseignant" CTA (from /kont + /enseigner, replacing the interest-capture for signed-in users) → multi-step wizard (profile: display_name, bio ht/fr, photo URL; payout method + destination; terms acceptance) → server action `applyAsTeacherAction` writes a `teacher_profiles` row status='pending' (one per user; re-apply updates a rejected one). Signed-out → auth CTA. `/enseigner` shows the applicant their status (pending/approved/rejected). Reuse the U4bis /enseigner page; keep the "byento" framing only until an admin can approve (now they can).
*Accept: a signed-in user completes the wizard → pending profile row (verify via harness); i18n ht/fr; wizard is polished (frontend-design pass — the owner wants impeccable UX).*

**C3-T3 — Admin: teacher approval + course review queue.**
`/admin/enseignants` (new, cap teachers.review = super-admin+admin): list teacher_profiles (pending/approved/suspended), approve/reject (bilingual note) → status change + audit; suspend/reactivate. Course review queue: courses with status='pending_review' → approve (→published + revalidatePath) / reject (→rejected + note), diff summary of changes. New capability `teachers.review` in permissions.ts + nav.
*Accept: admin approves a pending teacher → status approved; approves a pending course → published + public; audited; capability-gated.*

**C3-T4 — Teacher studio (/enseigner authenticated area).**
Approved teachers get a studio (reuse the CMS components from C2 write.ts, SCOPED to owner_user_id — a teacher only sees/edits their OWN courses). Screens: my courses (create draft, edit, SUBMIT for review — teacher can't self-publish; that's admin), my subscription/plan (price + included), my sales summary, my balance + earnings ledger, request withdrawal, video quota display. Server actions verify `owner_user_id === current user` on every mutation. Wire the level_ht/fr + lesson desc_ht/fr fields (the C2 gap) into the course/lesson editors here.
*Accept: an approved teacher creates+submits a course (owner=them), sees it pending; can't touch another teacher's course; balance/ledger render; withdrawal request creates a row.*

**C3-T5 — Earnings ledger + payouts (money).**
Extend `lib/payments/fulfill.ts`: on recording a course payment / subscription payment, ALSO write an `earnings_ledger` 'sale' row (teacher_user_id = course.owner or plan.owner; gross=amount, commission_pct=platform_settings.commission_pct frozen, commission_cents, net_cents=gross-commission). Idempotent alongside the existing payment write (one ledger row per payment — dedup by payment_id). On refund → negative 'refund' ledger row. Withdrawal: teacher requests (≥ threshold, ≤ balance, one pending at a time) → admin queue `/admin/retraits` (cap payouts.process) → mark paid (+reference) → 'withdrawal' negative ledger row; or reject. All audited. Balance = SUM(net_cents).
*Accept: a course purchase writes a 70/30 ledger row (harness); refund writes negative; withdrawal flow debits balance; guards (one pending, ≤ balance) enforced; money-path idempotency intact.*

**C3-T6 — Course ratings/reviews.**
`course_reviews`: enrolled learner rates 1–5 + comment on a course (one per learner, editable) → published instantly. Public: course sales page + /prof show rating (avg + count); learner's rating widget on the lesson/dashboard or course page (enrollment-gated server action). Report → admin removal (cap). Teacher rating = weighted avg across their courses' reviews. Wire into teacher_profiles rating display + /prof.
*Accept: an enrolled learner rates a course → visible avg updates; non-enrolled can't rate; teacher rating aggregates; admin can remove a reported review.*

**C3-T7 — Public teacher page + catalog-by-teacher (real from DB).**
Make /prof/[slug] read from teacher_profiles + DB courses (not the static data/teachers.ts) — photo, bio, rating (C3-T6), course count, student count, published courses, plan. Catalog filterable by teacher. Course sales page teacher block links real. Keep the "manifeste de cargaison / document d'expéditeur" design (frontend-design pass). data/teachers.ts kept as fallback for teacher #1 until seeded.
*Accept: /prof/[slug] renders from DB for an approved teacher; unknown/pending → 404; catalog teacher filter works; design polished.*

**C3-T8 — Whole-C3 review + cutover + merge.**
Seed teacher #1's profile (owner) via the seed script (extend scripts/seed-courses.ts or a new one). Verify the money path (ledger) end-to-end via fallback + reasoning. Full gates + whole-C3 review. Update the runbook (owner steps: db:push for C3 tables, seed teacher profile, set commission/threshold).

## Sequence
T1 schema → T2 onboarding → T3 admin approval → T4 studio → T5 ledger+payouts → T6 ratings → T7 public teacher page → T8 review+merge. Each: implement → gates → review → fix → commit. Ledger: .superpowers/sdd/progress.md. NOTE db:push is owner-manual (sandbox-blocked) — all built + verified via fallback; owner applies C3 migration + seeds to activate.
