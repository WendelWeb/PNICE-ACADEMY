# Métamorphose marketplace — Homepage + philosophie de prix — Plan

> Execute with subagent-driven-development. Implementers read PART A (design constitution from docs/superpowers/plans/2026-07-22-ui-refonte.md — still binding) + this file. Owner mandate: the homepage must read as a real course MARKETPLACE arrival, not a single-founder app.

## The philosophy shift (bind everything to this)

OLD (single-founder, WRONG now): the homepage presents ONE global offer — « $79 unlocks the whole catalog » + « à l'unité $7–49 » — as if PNICE Academy *is* the platform. A single global pricing table.

NEW (marketplace): the platform hosts many teachers; **each teacher sets their own prices, bundles, and subscription.** PNICE Academy is **teacher #1** — the flagship, presented like any teacher would be, NOT as "the platform." The $79 is **PNICE Academy's pass** (unlock PNICE Academy's courses), not "the platform subscription for all courses."

A visitor arriving on the homepage should feel: *"this is a marketplace — I can search, browse by category, discover teachers, and each course/teacher has its own price."* Everything is shown as if the marketplace is already live and populated (only PNICE Academy's real courses exist, but the chrome is a finished marketplace).

Kreyòl-first, A2 voice. USD + HTG everywhere. Remove any visitor-facing "prices are examples / will be replaced" disclaimer (keep it as an internal code comment only).

## Target homepage flow

1. **Hero** (keep the manifeste-vivant signature; copy → marketplace value prop: learn practical money-making skills from expert teachers, pay in gourdes, certificate at the end).
2. **MarketplaceBar (NEW)** — the "arrive & browse" moment: a prominent search field (« Ki konesans w vle metrize? » → submits to `/formations?q=…`) + 4 category tiles (Biznis / Dijital / Lajan / Lavi pratik, each with icon + live course count → `/formations?cat=…`). This is the marketplace's front door.
3. **Featured courses** — reframed showcase: marketplace course cards, each showing **teacher attribution** (PNICE Academy → /prof/pnice-academy), per-course price USD+HTG, category tag, rating placeholder «—». « Wè tout fòmasyon yo » → /formations.
4. **TeacherSpotlight (NEW)** — PNICE Academy presented as the flagship teacher: photo, name, « Anseyan #1 · 9 fòmasyon · nòt — », bio snippet, link → /prof/pnice-academy. **The $79 « Abònman PNICE Academy » pass lives HERE**, attributed to the teacher (« Louvri tout 9 fòmasyon PNICE Academy yo ak yon sèl abònman »), with perks + CTA → /checkout?plan=sub. This REPLACES the old global subscription framing.
5. **HowMarketplace (NEW, replaces the global Pricing table)** — « De fason pou aprann »: (a) pran abònman yon anseyan, (b) achte yon fòmasyon apa (a vi). Teacher-agnostic philosophy line: « Chak anseyan fikse pwòp pri li — yon sèl pri, pou tout moun, an dola tankou an goud. Pa gen frè kache. » 3-step "how it works": Chwazi → Peye an MonCash/kat → Aprann + sètifika.
6. **TeachTeaser** (become a teacher — keep as-is from U3).
7. **Founder/Istwa nou** — keep (platform origin story), ensure it reads as the marketplace's origin, not "my personal app." Light copy check.
8. **Testimonials · SeatsBanner · Faq · FinalCta** — copy reframe to marketplace voice; Faq: ensure the « how does pricing work / can I teach » answers reflect the marketplace model.

The old `components/home/Pricing.tsx` (global two-column table) is REMOVED from the page; its subscription → TeacherSpotlight, its à-l'unité concept → HowMarketplace + course cards.

## Tasks

**M1 — Homepage marketplace restructure.**
- NEW `components/home/MarketplaceBar.tsx` (client for the search field submit; category tiles are links). Search submits to `/formations?q=`. Category tiles: derive the 4 categories + live counts from `data/courses.ts` (reuse the category field + labels from U4's i18n).
- NEW `components/home/TeacherSpotlight.tsx` — server component; reads `data/teachers.ts` (teacher #1) + `data/pricing.ts` ($79 + perks). Presents PNICE Academy as a teacher AND carries the attributed $79 pass. Uses Sceau/Reveal, card-hover, links to /prof/pnice-academy and /checkout?plan=sub.
- NEW `components/home/HowMarketplace.tsx` — the « de fason pou aprann » + 3-step how-it-works + teacher-agnostic pricing philosophy line. Replaces the removed Pricing section.
- Rewire `app/[locale]/(site)/page.tsx` to the target flow above. Remove `<Pricing />` import/usage (leave the file in the repo for now, unused — or delete if clean; note it in report). Keep the `#fomasyon` and add `#pri`/`#anseye` anchors where nav/footer point (verify nav/footer anchor targets still resolve — `/#pri` should scroll to HowMarketplace or TeacherSpotlight; give one of them `id="pri"`).
- Copy: rewrite `home.hero` sub (light), `home.manifest`, new `home.marketplace`, `home.spotlight`, `home.how` namespaces; reframe `home.faq`/`home.finalCta`. Both languages, kreyòl-first. Remove the visitor-facing « pri yo se egzanp » string usage.
- Featured courses: reuse the existing card but ensure teacher attribution shows (depends on M2's card change — if M2 lands first, great; if M1 first, add a minimal teacher line inline and M2 harmonizes). To avoid coupling, M1 may show teacher attribution via a small inline « Anseyan: PNICE Academy » link derived from getCourseTeacher.
- Quality floor A5: i18n parity, 360px, focus-visible, reduced-motion, one h1 (hero), CLS-safe, no new deps.
- Accept: homepage reads as a marketplace (search + categories + featured courses + teacher spotlight + how-it-works + become-a-teacher); the $79 is clearly PNICE Academy's, not "the platform's"; no global "whole catalog / one price for everyone" table; no "prices are examples" visible.

**M2 — Teacher attribution on course cards + pricing-copy reframe site-wide.**
- `components/courses/CourseCardGrid.tsx` (home featured) + `components/courses/CourseCatalogCard.tsx` (/formations) + the course sales page hero: show a small teacher-attribution line/link (« Anseyan: PNICE Academy » → /prof/pnice-academy) via getCourseTeacher — so every course visibly belongs to a teacher, marketplace-style. Keep it subtle (mono, small), don't clutter the card.
- `data/pricing.ts`: keep the $79 + perks, but the perks/label copy contextualized as a TEACHER's pass (« tout fòmasyon PNICE Academy yo » not « tout katalòg la »). Update the `subscriptionPerks_*` first line accordingly.
- Checkout subscription option (`/checkout?plan=sub` summary): light copy so it reads as « Abònman PNICE Academy » not « abonnement plateforme » — verify checkout/page.tsx subscription branch copy; adjust the i18n string only (no wiring change — payment flow is frozen).
- `data/courses.ts`: keep prices as-is but move the « placeholder » note to a code comment only (it already is a comment — just ensure no visitor-facing string repeats it).
- Quality floor A5. No payment-wiring changes (PaymentMethods.tsx / route.ts / fulfill.ts frozen).
- Accept: every course card shows its teacher; the $79 reads as PNICE Academy's pass everywhere; no "whole platform catalog" framing remains.

## Verification (both tasks)
`npx tsc --noEmit`, `npm run build`, `npm test` (45), `npm run check:i18n` (exit 0) all green. Grep the messages files for surviving « tout katalòg », « whole catalog », « les 9 formations » platform-framing and « egzanp »/« exemple » price disclaimers — none should remain visitor-facing.
