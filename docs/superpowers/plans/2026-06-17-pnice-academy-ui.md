# PNICE Academy — UI/UX Implementation Plan

> **For agentic workers:** Build task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete front-end of PNICE Academy in mock (no backend), in the refined "manifeste de cargaison" visual direction, bilingual ht/fr.

**Architecture:** Next.js 14 App Router + TypeScript. next-intl drives `/ht` (default) and `/fr` locale routes. A small design-system layer (tokens + `<Sceau>` signature component + scroll-reveal) sits under page components. All content comes from centralized mock data files. Backend-dependent pages (checkout, dashboard, lesson player, auth) are visual shells.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS (custom tokens), next-intl, next/font (Big Shoulders / Work Sans / IBM Plex Mono), Tabler icons. No animation library (CSS + IntersectionObserver only).

## Global Constraints

- One single price per formation for everyone — no local/diaspora split.
- Money model: subscription $79/month USD **OR** à l'unité (lifetime), shown side by side.
- Gourdes equivalent shown wherever a USD amount appears (single `USD_TO_HTG` constant).
- Per-formation prices are placeholders, centralized in `data/courses.ts`, clearly marked.
- Tokens: ink #10204A, paper #EDE6D6, ochre #D98E2B, red #B23A2E (rare), teal #1F6E66, graphite #2B2B28.
- Fonts: Big Shoulders (display + Sceau), Work Sans (body), IBM Plex Mono (codes/prices/numbers).
- Default locale ht, fr toggle always available. Copy: concrete, active voice, sentence case, consistent vocabulary.
- The Sceau is the only bold element; everything else stays sober around it.
- Respect `prefers-reduced-motion`; keyboard focus visible on all interactive controls.
- Testimonials + "plas ki rete" counter clearly marked placeholder, never presented as real.
- Performance: next/image, lazy loading, minimal JS, no heavy libs, fonts `display=swap`.

---

### Task 0: Scaffold + Tailwind tokens + fonts
**Files:** `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `app/globals.css`, `app/fonts.ts`
- [ ] Init Next.js 14 App Router + TS structure, install deps (next, react, react-dom, typescript, tailwindcss, postcss, autoprefixer, next-intl, @tabler/icons-react).
- [ ] Tailwind config: map tokens to theme.extend.colors (ink/paper/ochre/red/teal/graphite) + fontFamily (display/body/mono via CSS vars).
- [ ] `app/fonts.ts`: next/font/google for Big_Shoulders_Display, Work_Sans, IBM_Plex_Mono → CSS variables.
- [ ] `globals.css`: base layer (paper bg, graphite text, body font), focus-visible ring, reduced-motion media query.
- [ ] Verify: `npm run build` passes.

### Task 1: i18n (next-intl) + locale routing
**Files:** `i18n/routing.ts`, `i18n/request.ts`, `middleware.ts`, `app/[locale]/layout.tsx`, `messages/ht.json`, `messages/fr.json`, `components/LangToggle.tsx`
- [ ] next-intl routing: locales ['ht','fr'], defaultLocale 'ht', localePrefix 'always'.
- [ ] Middleware + `[locale]` segment; root layout wires NextIntlClientProvider + font vars.
- [ ] Seed `messages/ht.json` and `messages/fr.json` with nav/common keys.
- [ ] `LangToggle`: switches between ht/fr preserving path.
- [ ] Verify: `/ht` and `/fr` both render; toggle works.

### Task 2: Design-system primitives
**Files:** `components/ui/Sceau.tsx`, `components/ui/Button.tsx`, `components/ui/Section.tsx`, `components/ui/Reveal.tsx`, `lib/cn.ts`
- [ ] `Sceau`: circular refined seal, props {children, size, rotate, tone}. Big Shoulders, ochre border, optional `print` load animation.
- [ ] `Button`: variants (ochre primary, ghost), focus ring, hover lift.
- [ ] `Section` + `Container`: spacing/width wrappers.
- [ ] `Reveal`: IntersectionObserver wrapper, staggered, reduced-motion safe.
- [ ] Verify: build + a scratch render.

### Task 3: Mock data + helpers
**Files:** `data/courses.ts`, `data/pricing.ts`, `data/testimonials.ts`, `lib/money.ts`, `lib/money.test.ts`
- [ ] `lib/money.ts`: `USD_TO_HTG`, `toHTG(usd)`, `formatUsd`, `formatHtg`.
- [ ] `data/courses.ts`: 9 courses (code PA-0X, slug, titles ht/fr, tagline ht/fr, learn_points ht/fr[], audience ht/fr, lessons[], priceUsd placeholder, icon). Content from spec PA-01..PA-09.
- [ ] `data/pricing.ts`: SUBSCRIPTION_USD=79; helper for monthly display in USD+HTG.
- [ ] `data/testimonials.ts`: 3 entries marked `// EXEMPLE — À REMPLACER`.
- [ ] Verify: unit test toHTG + data integrity (9 courses, unique slugs/codes) passes.

### Task 4: Shell — nav + footer + route line
**Files:** `components/layout/Nav.tsx`, `components/layout/Footer.tsx`, `components/layout/RouteLine.tsx`
- [ ] `Nav`: logo (lowercase) + LangToggle, sticky, thin border.
- [ ] `Footer`: payment methods as text (PayPal, Visa/Mastercard, MonCash, NatCash, Crypto) + links.
- [ ] `RouteLine`: subtle dotted vertical thread (decorative, aria-hidden), reduced-motion safe.
- [ ] Verify: appears on all pages via layout.

### Task 5: Landing page
**Files:** `app/[locale]/page.tsx` + `components/home/*` (Hero, Blockers, CourseManifest, Founder, Testimonials, SeatsBanner, Pricing, Faq, FinalCta)
- [ ] Hero: title/subtitle/CTA + Sceau "9 fòmasyon" with print animation + stats chips.
- [ ] Blockers: 3 concrete points.
- [ ] CourseManifest: 9 numbered manifest lines from data, price in Sceau, scroll-reveal stagger.
- [ ] Founder credibility block.
- [ ] Testimonials (placeholder, marked) + SeatsBanner (placeholder counter).
- [ ] Pricing: subscription 79$/mo (+HTG) vs à l'unité, side by side.
- [ ] FAQ (accordion) + FinalCta + payment logos.
- [ ] Verify: full page renders ht + fr, responsive.

### Task 6: Catalogue
**Files:** `app/[locale]/formations/page.tsx`, `components/courses/ManifestList.tsx`
- [ ] Manifest view of 9 lines (reuse CourseManifest pieces), links to detail.
- [ ] Verify: renders, links resolve.

### Task 7: Formation detail
**Files:** `app/[locale]/formations/[slug]/page.tsx`, `components/courses/CourseHeader.tsx`, `components/courses/LessonPlan.tsx`
- [ ] generateStaticParams from courses; 404 on unknown slug.
- [ ] Header (code Sceau, tagline), "sa w ap konn fè", pour qui, lesson plan, buy CTA (subscription or à l'unité).
- [ ] Verify: all 9 slugs render ht + fr.

### Task 8: Checkout shell
**Files:** `app/[locale]/checkout/page.tsx`, `components/checkout/PaymentMethods.tsx`
- [ ] Choose subscription or single course; payment method buttons (non-functional, labeled "demo").
- [ ] Verify: renders.

### Task 9: Dashboard + lesson player shells
**Files:** `app/[locale]/tableau-de-bord/page.tsx`, `app/[locale]/tableau-de-bord/[course]/lecon/[id]/page.tsx`, `components/dashboard/*`
- [ ] Dashboard: mock enrolled courses + progress bars.
- [ ] Lesson player: placeholder video frame + lesson list + progress.
- [ ] Verify: renders.

### Task 10: Auth shells
**Files:** `app/[locale]/sign-in/page.tsx`, `app/[locale]/sign-up/page.tsx`, `app/[locale]/kont/page.tsx`
- [ ] Static styled placeholders noting Clerk comes later.
- [ ] Verify: renders.

### Task 11: Polish + quality checklist
- [ ] Responsive pass (mobile → desktop), focus-visible audit, reduced-motion audit.
- [ ] `npm run build` clean; no console errors.
- [ ] Verify against spec §11 checklist.
