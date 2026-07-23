# Lancement — tout ce qui est codable (sans action externe) — Plan

> Execute with subagent-driven-development. Goal: bring the app to "code-complete for launch" — everything that does NOT require the owner to buy a domain, record videos, create external accounts, or post API keys. Every integration stays **env-gated + inert** until keys are posted, degrading gracefully (the app already does this pattern: Clerk, Resend, Bunny health check, Stripe all env-gate).

## What is codeable now (this plan) vs owner-manual (out of scope)

**Codeable (this plan):** learner delivery wired to real DB purchases; complete `realDataSource()`; PDF receipts + certificates; env-gated Bunny player + upload code; cron route handlers + `vercel.json`; certificate auto-issuance; real progress; real UTM capture at signup.

**Owner-manual (NOT this plan):** buy domain; record + upload videos to Bunny; create Bunny/Resend/MonCash/NatCash accounts + post keys; run `npm run db:push` on the live DB; Stripe CLI live E2E; deploy to Vercel; flip `ADMIN_DATA_SOURCE=real`; set real prices; enable admin 2FA. A crisp runbook for these lands in `docs/launch-checklist.md` (update at the end).

## Global constraints
- Money in cents; DB vocabulary mapping (completed→succeeded, stripe→card) as in `lib/admin/data/real/users.ts`.
- Bilingual ht/fr, `npm run check:i18n` exit 0; `npx tsc --noEmit` + `npm run build` + `npm test` green each task.
- Env-gate everything: no DATABASE_URL / no keys ⇒ safe fallback, never a crash. Public learner pages that newly read the DB must not break the static/mock dev experience (no DB ⇒ empty state, exactly like U7's empty dashboard).
- PDF is the one place a new runtime dependency is justified (choose a pure-JS lib with no native binaries, e.g. `pdf-lib`). No other new runtime deps.
- Payment wiring (PaymentMethods.tsx / api/checkout / api/webhooks/stripe / lib/payments/fulfill.ts) is FROZEN except where a task explicitly extends fulfillment (PDF receipt attach, UTM).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## L1 — Livraison élève (LE bloqueur n°1 : connecter acheter → apprendre)

The learner experience is currently a hardcoded `ENROLLED` demo array with no access gate and no real progress. Wire it to the DB.

**Access model (binding):** a signed-in user has access to a course's lessons if ANY of: (a) an active `enrollments` row for that `course_slug`; (b) an active `subscriptions` row (the $79 pass → all of the owning teacher's courses; today PNICE = all 9); (c) the lesson is a free preview (`isPreview` in data/courseDetails.ts / lessons). Admin comp already writes an enrollment (grantCourseAccess), so it's covered by (a).

- **L1a — `lib/learner/access.ts`** (Drizzle reads, gated on DATABASE_URL): 
  - `getMyLearning(clerkId): Promise<{ courses: MyCourse[]; hasSubscription: boolean }>` — the user's enrolled courses (join enrollments.course_slug → data/courses.ts) + whether they hold an active sub; `MyCourse` = { slug, lessonsDone, lessonsTotal, lastLessonIndex }.
  - `hasCourseAccess(clerkId, courseSlug): Promise<boolean>` — the access model above.
  - `getCourseProgress(clerkId, courseSlug): Promise<Set<number>>` (completed lesson indexes).
  - No DB / signed out ⇒ `{ courses: [], hasSubscription: false }` / false. Test with a dotenv harness against the live DB (like `scripts/check-payments.ts`) — script `scripts/check-learner.ts`.
- **L1b — Dashboard** (`app/[locale]/(site)/tableau-de-bord/page.tsx`): replace `ENROLLED` with `getMyLearning(clerkId)`. Keep U7's visual design (route-line progress, continue card, empty state) — just feed real data. If a user holds an active sub but has 0 started courses, still show the catalog invite + « ou gen abònman an » note. Remains `force-dynamic`.
- **L1c — Lesson access gate** (`.../tableau-de-bord/[course]/lecon/[id]/page.tsx`): before rendering, `hasCourseAccess` — if false AND the lesson isn't a free preview → redirect to the course sales page (`/formations/[slug]`) with a soft "achte pou w gen aksè" state (or just redirect). Show real completed-checkmarks from `getCourseProgress`.
- **L1d — Real progress + certificate issuance**: `lib/learner/progress-actions.ts` server action `markLessonDoneAction(courseSlug, lessonIndex)` — auth-gated, verifies access, upserts `progress` (completedAt=now). On the action detecting ALL lessons of the course are now complete, **auto-issue a certificate** (insert `certificates` row: userId, courseSlug, verificationCode [generate], recipientName = user.certificateName ?? user.name; idempotent — don't double-issue). Wire the inert « Make fini » button to it (useTransition, optimistic ok). The public `/certificats/verifier/[code]` already renders it.
- Accept: with a real enrollment in the DB, the course shows on the dashboard, its lessons are reachable, marking lessons writes progress, finishing all lessons issues a verifiable certificate; without access, lessons redirect. Empty/no-DB state unchanged.

## L2 — Compléter `realDataSource()` (admin 100% réel)

Mirror the mock's exact contract (per `lib/admin/data/mock/index.ts`) in Drizzle for the remaining domains, add each to `lib/admin/data/real/index.ts`. Test-driven against the live DB (harness), same as users/transactions. Split into reviewable chunks:
- **L2a — subscriptions**: getSubscriptions/getSubEvents/getDunning/getRenewals/getRenewalSeries/getCohorts/getSubKpis/getCancellationReasons.
- **L2b — analytics**: getAnalytics (revenue/signups/enrollments/method/course/geo/lang/funnel/heatmap — SQL aggregates; the visitor→account funnel step stays MOCK-flagged, no traffic source).
- **L2c — engagement + certificates**: getCourseCompletion/getCourseTimes/getLessonViews/getAggregateDropoff/getActiveLearners/getStuckUsers/getCertificates/getCertificateByCode + cert mutations (revoke/reissue/issue).
- **L2d — marketing**: promos (list/detail/create/setActive/delete/validate/redeem), UTM, carts, referrers, credits.
- **L2e — support**: tickets (list/detail/create/assign/reply/status), templates, notifications, webhook logs, error logs, settings.
- Accept per chunk: `tsc` green (contract conformity), harness reads real rows, mock stays the fallback for un-migrated methods. Note: some derived analytics may return empty/degenerate on a near-empty prod DB — that's correct, documented.

## L3 — PDF (reçus + certificats)

- Add `pdf-lib` (pure JS, no native deps). `lib/pdf/receipt.ts` (buildReceiptPdf) + `lib/pdf/certificate.ts` (buildCertificatePdf — kraft/seal/ochre, recipient name, course, code, verify URL).
- Certificate download: route `app/api/certificate/[code]/route.ts` (public, streams the PDF for a valid code; 404 revoked/unknown) — link it from the verify page + dashboard.
- Receipt: attach/generate on fulfillment — extend `lib/payments/fulfill.ts` to also produce the PDF and either attach via Resend or link in the email (env-gated; no-op without RESEND). Keep idempotency intact.
- Accept: a valid cert code streams a real PDF; a receipt PDF is generated on payment (verifiable via a unit test of the pure builders).

## L4 — Lecteur Bunny (env-gated, code prêt sans clés)

- `components/learn/LessonPlayer.tsx`: when `BUNNY_STREAM_LIBRARY_ID` is set AND the lesson has a `bunnyVideoId`, render the Bunny iframe embed (signed/tokenized per Bunny's embed contract); otherwise the current placeholder. `lib/bunny/embed.ts` builds the embed URL / token (env-gated). No keys ⇒ placeholder, exactly as today.
- Lesson data: ensure a `bunnyVideoId` field exists per lesson (data/courseDetails.ts or the content store) — nullable; the CMS already has a Bunny-ID field (Phase C). Wire it through to the player.
- Accept: with a library id + a lesson video id, the player renders the Bunny embed; without, the placeholder. No crash either way.

## L5 — Crons + config déploiement

- `app/api/cron/abandoned-carts/route.ts` — marks checkout_sessions abandoned past 2h + (env-gated) sends relance email; `app/api/cron/daily-digest/route.ts` — builds + (env-gated) sends the admin digest. Both protected by a `CRON_SECRET` bearer check (Vercel cron pattern), no-op email without RESEND.
- `vercel.json` — cron schedules (2h carts, daily digest at the configured hour) + any needed function config.
- Real UTM capture: on first authenticated visit / signup, persist first-touch UTM to `user_acquisition` (env-gated on DB) — a small server action or middleware-read; wire where signups land.
- Accept: cron routes runnable (return JSON, protected), vercel.json valid, UTM row written on first visit with params (harness-verifiable).

## L6 — Runbook final
- Update `docs/launch-checklist.md` to a crisp OWNER runbook of exactly the manual steps left (domain, videos, accounts, keys, db:push, Stripe CLI E2E, deploy, ADMIN_DATA_SOURCE=real, prices, 2FA), each with the command/where. Update `.env.example` with any new names (CRON_SECRET, etc.).

---

## Sequence
L1 first (unblocks the core buy→learn loop). Then L4 (video code ready) + L3 (PDF) in parallel-safe order, L2 (admin real) can proceed independently, L5 + L6 last. Each task: implement → gates → review → fix → commit. Ledger: `.superpowers/sdd/progress.md`.
