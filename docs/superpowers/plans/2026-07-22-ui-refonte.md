# Refonte UI/UX — « PNICE Academy, la plateforme » — Direction + Plan

> **For agentic workers:** execute task-by-task with superpowers:subagent-driven-development. Each task's implementer MUST read this WHOLE file first — it is the design constitution. Deviating from the Direction section is a spec violation.

**Goal:** transform the public site from "app made for one founder" into a professional, persuasive, bilingual (kreyòl-first) course-marketplace — every page, every corner: repositioned copy, orchestrated motion, elevated detail. No feature changes to payments/admin.

**Owner mandate (verbatim intent):** « transforme totalement… chaque page chaque recoin… la manière la plus pro qui soit, ui/ux, design, smooth, marketing, phrases convaincantes… épate-moi. »

---

## PART A — DIRECTION (binding)

### A1. Identity — keep and elevate, never replace

The validated brand is **« manifeste de cargaison raffiné »** — a refined shipping manifest: kraft paper, ink-navy, an elegant ochre seal. The refonte ELEVATES its execution; it does not restyle.

Tokens (existing in tailwind.config.ts — reuse, never hardcode hex in components):
- `ink #10204A` (text, structure) · `paper #EDE6D6` (+ paper-light) · `ochre #D98E2B` (seal/accent, CTAs) · `stampred #B23A2E` (RARE — alerts/urgency only) · `teal #1F6E66` (routes, positive signals) · `graphite #2B2B28` (body text)
- Type roles: **Big Shoulders** (font-display) = headlines, always tight leading, black weights; **Work Sans** = body; **IBM Plex Mono** (font-mono) = codes, prices, stats, eyebrows — the "document data" voice.

Vernacular devices (use meaningfully, not decoratively): seals/stamps (`Sceau`), manifest tables (code · designation · price), route lines (teal dotted, journey), document headers (mono, uppercase, tracking-wide), the course codes `PA-01…PA-09`.

### A2. Repositioning — the marketing thesis

FROM « les 9 formations de Stanley » TO **« la plateforme haïtienne des savoir-faire pratiques »** — where you learn skills that make money in the Haitian reality (MonCash, gourdes, débrouillardise), and where — soon — anyone who masters a skill will teach it.

Voice: direct, concrete, kreyòl-first (ht is default locale; fr mirrors it, never the reverse). Active verbs. Prices always USD + HTG. Never corporate filler ("solutions innovantes" = banned). Specificity sells: "Kreye yon kat vityèl an 10 minit" beats "Maîtrisez les outils digitaux".

Key copy anchors (implementers refine around these, both languages):
- Hero H1 (ht): **« Konesans pratik ki fè lajan. »** / (fr): « Des savoir-faire concrets qui rapportent. »
- Hero sub: platform-wide — learn with experts, pay in gourdes via MonCash, certificate at the end.
- Teach teaser H2 (ht): **« Ou metrize yon konesans? Byento w ap ka anseye l isit la. »** / (fr): « Tu maîtrises un savoir-faire ? Bientôt tu pourras l'enseigner ici. » — with 3 mono facts: « Fikse pri w » · « 70% pou ou » · « Peye an MonCash ».

### A3. Signature element — « le manifeste vivant » (spend the boldness HERE)

The homepage hero becomes a two-column composition (stacks on mobile):
- Left: H1 + sub + CTAs (primary ochre « Kòmanse aprann », ghost « Gade katalòg la »).
- Right: a rendered **cargo-manifest document** — kraft card, mono document header (« MANIFESTE · PNICE ACADEMY · PA-2026 »), rows = 4-5 REAL catalog entries (`PA-01 · Zouti finansye dijital · $9`), a footer row « +4 lòt fòmasyon… ». On load (once, ~900ms total, orchestrated): rows type/fade in staggered (60ms), then the ochre `Sceau` **stamps down** onto the document corner (scale 1.6→1, rotate −8°, cubic-bezier(0.2,1.4,0.3,1), subtle settle). A teal dotted **route line** starts under the manifest and draws down the page as you scroll (extend existing `RouteLine`).
- This is the ONE theatrical moment. Everything else: quiet 12px-fade reveals and restrained hovers.

### A4. Motion system (site-wide, binding)

- Foundation: existing `Reveal` (scroll fade+rise) + `.reveal` CSS. ADD: `Stamp` (the seal animation, reusable — hero, merci page, certificate verify), `nav elevation` (sticky nav gains bg-paper/85 + backdrop-blur + hairline border after 8px scroll), card hover grammar (translateY(-3px), border-ink/35, seal child rotates +2°, 180ms ease-out), button press (scale .98).
- Rules: animate opacity/transform ONLY (no layout thrash). Every effect inside `@media (prefers-reduced-motion: no-preference)` or the existing `.reveal` reduced-motion fallback. No parallax, no infinite loops (except one subtle route-line dash drift ≤ allowed), nothing over 900ms.
- No new dependencies. CSS + IntersectionObserver only.

### A5. Quality floor (every task)

Responsive to 360px; visible keyboard focus (`focus-visible` ring ochre); i18n parity — EVERY new/changed key exists in BOTH messages/ht.json AND messages/fr.json (ht written first); semantic headings (one h1/page); `npm run build` + `npx tsc --noEmit` + `npm test` green before every commit; alt text meaningful; no CLS from animations (reserve space).

---

## PART B — TASKS

Branch: `feature/ui-refonte` (from main after C1-P1 merge). One commit per task minimum. Each task = implementer reads PART A + the task; reviewer checks against PART A + task acceptance.

**U1 — Fondations motion + Nav + Footer.**
Create `components/ui/Stamp.tsx` (in-view/on-load stamp animation wrapping Sceau, respects reduced-motion); extend globals.css with the motion grammar (stamp keyframes, nav-elevated styles, card-hover utilities); Nav: sticky elevation on scroll, active-link underline (ochre, animated width), mobile menu polish, CTA button in nav (« Kòmanse »); Footer: full platform footer — 4 columns (Aprann / Anseye [byento] / Èd / Legal), payment-methods mono badges (MonCash · NatCash · Visa · PayPal), locale toggle, contact, © line. i18n `footer.*` overhaul.
*Accept: nav elevates smoothly, footer looks like a real platform's, build green.*

**U2 — Hero « manifeste vivant » + trust strip.**
Rebuild `components/home/Hero.tsx` per A3 (new `ManifestCard` client component with the orchestrated load sequence; real data from data/courses.ts). Below hero: trust strip — 4 mono stats (fòmasyon count real, « 2 lang », « Sètifika », « MonCash ✓ »). Replace hero slideshow (photo moves into Founder/story section). i18n `home.hero.*` rewritten per A2.
*Accept: stamp lands once per visit, reduced-motion shows final state instantly, LCP not regressed (manifest is DOM, not image), mobile stacks cleanly.*

**U3 — Corps de la home : repositionnement.**
`Blockers` copy tightened (problems → concrete Haitian blockers); NEW `components/home/TeachTeaser.tsx` per A2 (kraft panel, 3 mono facts, interest CTA → server action `registerTeachInterestAction` in `lib/site-actions-public.ts` that inserts an `admin_notifications` row kind 'sale'-style? NO — use a new lightweight approach: write to `webhook_logs`? NO. Simplest honest: the CTA is a mailto link? Not pro. DO: server action appending to `admin_notifications` via the existing data-layer `createTicket` — also no. **Decision: store interest via `lib/admin/data` contract method `createTicket` with type 'other', subject "Enterese anseye" — it exists, surfaces in admin support inbox, zero schema change.** Gate: signed-in users use their account; signed-out get the auth CTA); `Founder` reframed to « Istwa nou » (institution origin story, photo from the old hero); `Pricing` copy sharpened (à l'unité vs abonnement, HTG equivalents, « pa gen frè kache »); `Faq` +2 marketplace questions; `FinalCta` rewrite. All sections wrapped in `Reveal` with sane staggers.
*Accept: home reads as a platform top-to-bottom in BOTH languages; interest CTA actually lands in admin support list (verify via mock mode).*

**U4 — Catalogue /formations.**
Page header as document («  KATALÒG · 9 FÒMASYON »), filter chips (Tout / Biznis / Dijital / Lavi pratik — client-side, from a new `category` field? NO schema change: derive from existing course data groupings hardcoded in the page), cards get the hover grammar + « Nouvo » possibility, each card: code, seal, title, 3 learn-bullets, price USD+HTG, lesson count. Empty/loading states n/a (static data).
*Accept: filterable grid, hover grammar consistent, both languages.*

**U5 — Page de vente /formations/[slug].**
Persuasive restructure: sticky buy-card (desktop right rail; mobile bottom bar) with price USD+HTG, « Aksè avi » (lifetime), guarantee line, CTA; hero: code+seal+title+promise; body: « Pou ki moun » / « Sa w ap aprann » (checklist) / manifest lesson list (existing ManifestList, polished with durations) / FAQ / teacher block placeholder (« Anseye pa: PNICE Academy » — ready for C3) / final CTA. Social proof: testimonial pull if one matches the course.
*Accept: buy-card sticky behavior correct on both breakpoints, CTA → existing checkout flow untouched functionally.*

**U6 — Checkout + Merci.**
Checkout: trust signals around PaymentMethods (lock mono line « Peman sekirize », refund note, methods badges), order summary polish (seal, HTG line), promo field demo-badge stays. Merci: the `Stamp` moment — big ochre « ✓ PEYE » seal stamps onto a receipt-style card, then next steps (dashboard CTA, email note). No functional changes to the payment wiring.
*Accept: no regression to /api/checkout flow (build + manual dev-server click to Stripe redirect still works), merci stamp respects reduced-motion.*

**U7 — Tableau de bord + leçon.**
Dashboard: greeting with user's name, per-course progress as a **route line** (teal, % traveled, station dots = lessons), continue-CTA card first, empty state = invitation (« Katalòg la ap tann ou » + CTA). Lesson page: cleaner player frame (16:9 reserved, kraft border), lesson list rail with done-checkmarks (stamped ✓), next/prev, « Make fini » press states.
*Accept: works with mock progress data exactly as before; empty + populated states both styled.*

**U8 — Kont + Vérification certificat + Témoignage + Légal.**
Kont: section headers as document tabs, spacing/typography pass (no logic changes). Certificats/verifier: the certificate renders as an actual bordered document with seal + `Stamp` on valid (teal VALID / stampred REVOKE), mono verification code. Temoignage/[token]: friendlier form UX (labels, focus, thanks state). Legal: readable typographic page (max-w-prose, heading hierarchy).
*Accept: zero logic changes; all four visually coherent with A1.*

**U9 — Sweep final.**
i18n parity audit (script: compare key sets of ht/fr — write scripts/check-i18n.ts, run it, fix gaps); focus-visible audit; 360px pass on every public page; kill any leftover "9 formations de X" personal phrasing; `npm run build` bundle sanity (no page regressed > +10kB first load without cause); update README/docs screenshots note. Final whole-branch review (subagent) + fixes.
*Accept: parity script exits 0 and is added to `npm test`? NO — standalone `npm run check:i18n`; all gates green.*

---

## PART C — SELF-CRITIQUE (per frontend-design skill, done at plan time)

- Generic-default check: cream+serif+terracotta cluster? The palette is adjacent (kraft/ochre) BUT the manifest/logistics vernacular (mono document data, seals, route lines, cargo codes) is subject-specific and already owner-validated — we keep it and sharpen the vernacular rather than drift toward generic "warm editorial". The signature (stamping manifest) is not in the AI-default cluster.
- One-boldness rule: theatrical motion is concentrated in the hero manifest + two `Stamp` reprises (merci, certificate) — justified as the same gesture (official documents get stamped). Everything else is 12px fades. Pass.
- Numbered markers: only where sequence is real (how-it-works steps, lesson lists). Pass.
- Copy risk: kreyòl-first persuasive copy is the differentiator; fr must not read as the "original". Enforced in A5. Pass.
