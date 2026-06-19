# PNICE Academy — Prompts d'images (Nano Banana Pro)

Génère chaque image avec **Nano Banana Pro**, puis dépose-la dans `/public` au chemin indiqué.
Le code détecte automatiquement le fichier (`jpg`, `webp`, `png` ou `avif`) et remplace le placeholder SVG — **aucune modification de code à faire**.

## Règles
- Formats acceptés : `.webp` (recommandé, léger), `.jpg`, `.png`, `.avif`.
- **Garde le sujet centré avec de la marge** (haut/bas + gauche/droite) : la même image est recadrée en 4:3 (carte) et en 16:9 (couverture).
- Vise des fichiers légers (connexions mobiles en Haïti) : ≤ 300 Ko en `.webp` si possible.

## Style commun à coller en tête de CHAQUE prompt (cohérence de la série)

> Authentic documentary editorial photograph, real Haitian people, natural daylight, candid unposed moment, shot on a 35mm lens at f/2.0, soft natural shadows, warm and trustworthy mood. Restrained color grade: warm kraft/sand neutrals, deep indigo, a single ochre accent. Realistic skin texture, true-to-life, photojournalistic. Not a stock photo. **No text, no logos, no watermark, no UI overlays. Avoid: plastic skin, over-saturation, HDR look, distorted hands, extra fingers, fake studio backdrop, cheesy posing.**

---

## Bannières

### `public/images/hero.webp` — Hero (ultra-large 21:9, ~2520×1080)
> [Style commun] + A confident young Haitian woman in her twenties standing in a sunlit doorway of a small shop in Port-au-Prince, holding a smartphone, a faint warm smile as she looks at it, a physical debit card resting on a wooden counter nearby. Behind her, a softly blurred street with tropical light. Composition wide and cinematic with negative space on the left for breathing room. Honest, hopeful, grounded — someone building something real.

### `public/images/founder.webp` — PNICE Shipping (4:3, ~1600×1200)
> [Style commun] + A small Miami–Haiti shipping operation: stacked cardboard boxes and blue plastic barrels in a clean warehouse, a Haitian man in his thirties in a simple polo checking a paper manifest on a clipboard, golden late-afternoon light through a roller door. The atmosphere is organized, proud, hard-working — a real logistics business, not a corporate stock set.

---

## Formations (16:9, ~1920×1080, sujet centré)

### `public/images/courses/pa-01.webp` — Outils financiers numériques
> [Style commun] + Close, warm shot of a Haitian young man's hands holding a smartphone that displays a clean virtual bank card, a physical card on a wooden table beside a cup of coffee. Soft window light. Conveys control and access to money. Centered subject, calm and capable.

### `public/images/courses/pa-02.webp` — Acheter sur Amazon, Shein, Alibaba
> [Style commun] + A Haitian woman at a small home table comparing products on a laptop and phone, two opened shipping parcels and a few clothing items nearby, taking notes. Bright daylight. The feeling of smart, careful online shopping and reselling. Centered, organized.

### `public/images/courses/pa-03.webp` — Business shipping USA–Haïti
> [Style commun] + A young Haitian entrepreneur in a warehouse standing beside labeled boxes and a blue shipping barrel, holding a phone and a small notebook, mid-conversation with a client off-frame. Warm industrial light. Proud small-business owner energy. Centered with headroom.

### `public/images/courses/pa-04.webp` — Marketing digital
> [Style commun] + A Haitian shop owner filming a product on her phone mounted on a small ring light, styling an item for an Instagram post, colorful but tasteful background of her boutique. Natural light mixed with soft ring glow. Creative and entrepreneurial. Centered.

### `public/images/courses/pa-05.webp` — IA pour flyers professionnels
> [Style commun] + A young Haitian designer at a laptop, holding up a freshly printed professional flyer for a small business, comparing it to the screen, satisfied. Warm desk light, a few brand color swatches on the table. The pride of making something pro yourself. Centered.

### `public/images/courses/pa-06.webp` — IA pour WhatsApp et Telegram
> [Style commun] + A Haitian shopkeeper relaxed behind a counter glancing at a smartphone showing a messaging conversation, while the shop runs calmly around her. Implies automation handling customers. Warm, easy, in-control mood. Soft daylight. Centered subject.

### `public/images/courses/pa-07.webp` — IA pour créer site et app
> [Style commun] + A focused young Haitian creator at a laptop in a simple bright room, a smartphone on a stand beside the laptop showing a clean app mockup, hands on the keyboard, expression of quiet excitement. Natural light. Building an idea into reality. Centered.

### `public/images/courses/pa-08.webp` — Sécurité et anti-arnaque
> [Style commun] + A thoughtful Haitian person sitting by a window calmly setting up two-step verification on a smartphone, a protective and reassured expression, soft daylight. Conveys safety and awareness — human and calm, not a clichéd hooded hacker. Centered, warm.

### `public/images/courses/pa-09.webp` — Monétiser avec du contenu
> [Style commun] + A Haitian content creator filming themselves or a subject with a phone on a tripod and a soft light, headphones around the neck, a relaxed creative studio corner at home. Warm light. The feeling of building a content business. Centered subject with margin.

---

---

## Images additionnelles (déployées partout dans l'app)

### Avatars de témoignages (carré 1:1, ~600×600, visage centré)
Portraits chaleureux et authentiques. Cadrage tête + épaules, regard franc, sourire léger.

- **`public/images/avatars/avatar-1.webp`** — [Style commun] + Friendly authentic portrait of a Haitian woman in her late twenties, Cap-Haïtien, natural daylight, warm genuine smile, simple everyday clothing, soft background. Real, approachable.
- **`public/images/avatars/avatar-2.webp`** — [Style commun] + Friendly authentic portrait of a Haitian man in his thirties, Miami, natural light, confident warm expression, casual polo, soft neutral background. Trustworthy small-business owner.
- **`public/images/avatars/avatar-3.webp`** — [Style commun] + Friendly authentic portrait of a Haitian woman in her early twenties, Port-au-Prince, natural light, bright optimistic smile, simple modern style, soft background.

### Images « mise en situation » des fiches (16:9, ~1920×1080) — complémentaires des couvertures
Montre le **résultat / la personne en action**, un angle différent de la couverture. Sujet centré avec marge.

- **`public/images/courses/pa-01-b.webp`** — [Style commun] + A Haitian person happily completing an online purchase on a phone, a virtual card screen visible, a relieved confident smile. The moment a payment finally works.
- **`public/images/courses/pa-02-b.webp`** — [Style commun] + A Haitian reseller joyfully opening a delivered parcel of products at home, organizing items to resell, satisfied.
- **`public/images/courses/pa-03-b.webp`** — [Style commun] + A Haitian shipping entrepreneur handing a labeled box to a happy client, a small storefront, warm trust between them.
- **`public/images/courses/pa-04-b.webp`** — [Style commun] + A Haitian vendor checking strong sales notifications on a phone, smiling, surrounded by her products, momentum and growth.
- **`public/images/courses/pa-05-b.webp`** — [Style commun] + A Haitian small-business owner pinning a freshly printed pro flyer on a shop wall, proud of the clean design.
- **`public/images/courses/pa-06-b.webp`** — [Style commun] + A relaxed Haitian shop owner enjoying free time with a coffee while the phone shows automated customer replies handling business.
- **`public/images/courses/pa-07-b.webp`** — [Style commun] + A Haitian creator proudly showing a finished website and a mobile app live on a phone screen, accomplished and excited.
- **`public/images/courses/pa-08-b.webp`** — [Style commun] + A Haitian person calm and reassured after securing their accounts on a phone, a protected confident posture, warm light.
- **`public/images/courses/pa-09-b.webp`** — [Style commun] + A Haitian content creator reviewing growing channel analytics on a laptop, headphones on, motivated by real results.

### Bandeau confiance — checkout (large 4:1, ~2000×500)
- **`public/images/secure.webp`** — [Style commun] + Calm close shot of Haitian hands confidently completing a secure payment on a smartphone, soft warm light, a sense of safety and trust. Wide banner composition with space for an overlaid headline. Dark enough to keep white text readable.

---

## Astuce cohérence
Génère d'abord le **hero** et garde-le comme référence de style, puis demande à Nano Banana Pro de conserver la même lumière / le même grade colorimétrique pour toutes les autres, afin que toute la série ressemble à un seul shooting de marque.

## Récap des 24 fichiers à générer
- 2 bannières : `hero`, `founder`
- 9 couvertures formations : `courses/pa-01` … `pa-09`
- 9 mises en situation : `courses/pa-01-b` … `pa-09-b`
- 3 avatars : `avatars/avatar-1..3`
- 1 confiance : `secure`
