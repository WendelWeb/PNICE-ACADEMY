# PNICE Academy — Launch checklist (Phase D Lot 3)

The whole admin + public site runs on a deterministic **mock** dataset
(`lib/admin/{data,content,site,platform}`). Going live is a **configuration +
wiring** exercise, not a rewrite: every screen reads through a single seam
(`lib/admin/data/index.ts`), so swapping mock → real changes no UI.

Live status is visible at **`/admin/sante` → Branchement backend** (it only
reports whether each integration is *configured*, never any secret value).

---

## Phase 0 — Foundation (code is ready; these need your credentials)

1. **Provision the database (Neon).**
   - Create a Neon Postgres project → copy the **pooled** connection string.
   - Set `DATABASE_URL` in `.env.local` (see `.env.example`).
   - Push the schema: `npm run db:push` (or `db:generate` then `db:migrate`).
     The schema (`db/schema.ts`) already covers every mock entity — users,
     payments, subscriptions, enrollments, progress, certificates, promo codes +
     redemptions, credit ledger, referrals, checkout sessions, UTM acquisition,
     support tickets + replies + templates, admin notifications, webhook logs,
     error logs, platform settings.

2. **Wire Clerk user-sync.**
   - Clerk Dashboard → Webhooks → add endpoint `…/api/webhooks/clerk`,
     subscribe to `user.created`, `user.updated`, `user.deleted`.
   - Copy the signing secret → `CLERK_WEBHOOK_SECRET`.
   - The route (`app/api/webhooks/clerk/route.ts`) verifies the Svix signature
     and upserts/deletes `users`. It returns 503 until the secret + DB are set.
   - Backfill existing Clerk users once (script: list users → upsert).

## Phase 1 — Make the admin real

3. **Implement `realDataSource()`** in `lib/admin/data/index.ts` (Drizzle
   queries against `db/schema.ts`), then set `ADMIN_DATA_SOURCE=real`.
   - Do this **test-driven against the live DB** (it can't be validated on mock).
   - Straightforward 1:1 reads/writes first (users, tickets, notifications,
     webhooks, promos, payments); derived analytics (cohorts, funnel, heatmap)
     as SQL/materialised views last.
   - The mock implementation (`lib/admin/data/mock/index.ts`) is the reference
     for every method's exact shape.

## Phase 2 — Money + side effects (need provider credentials)

4. **Payment rail #1 — Stripe (test mode first).**
   - Checkout session creation + `…/api/webhooks/stripe` → write `payments`,
     `enrollments`, and a `webhook_logs` row per event (the `/admin/sante`
     webhook table then becomes real). Keys: `STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET`.

5. **Payment rail #2 — MonCash (sandbox).** Redirect flow + confirmation
   callback → same `payments`/`enrollments`/`webhook_logs` writes.
   Keys: `MONCASH_CLIENT_ID`, `MONCASH_CLIENT_SECRET`.

6. **Email — Resend.** Set `RESEND_API_KEY` (+ `RESEND_FROM`). `lib/email/resend.ts`
   already sends via the Resend REST API and is a safe no-op without the key;
   ticket replies are wired. Wire the rest: receipts, dunning, cart relance,
   announcements, and the daily admin digest (Vercel cron at the configured hour).

7. **Video — Bunny.** Set `BUNNY_STREAM_API_KEY` + `BUNNY_STREAM_LIBRARY_ID`.
   The `/admin/sante` Bunny health check is already real; wire real upload +
   playback in the courses CMS.

8. **PDF.** Generate receipts + certificates (the public verify page already
   exists at `/certificats/verifier/[code]`).

## Phase 3 — Go-live

9. **Reconcile section by section.** For each admin area, flip to real data,
   compare against expectations, fix queries. Keep `ADMIN_DATA_SOURCE=mock` as
   the instant rollback.

10. **Launch gate.** `/admin/sante → Branchement backend` shows **« Prêt »**
    only when: all *required* integrations configured (DB, Clerk, Clerk webhook)
    **+** `ADMIN_DATA_SOURCE=real` **+** at least one payment rail live. Then:
    seed minimal prod content, enable a real payment rail, remove
    `ADMIN_BOOTSTRAP_EMAILS`, and announce.

---

### Required env vars
See [`.env.example`](../.env.example). Required to sell: `DATABASE_URL`,
Clerk keys + `CLERK_WEBHOOK_SECRET`, and ≥1 payment provider. Everything else is
optional and degrades gracefully (the app reports it as "non configuré").
