# PNICE Academy — Spec design (phase UI/UX)

> Date : 2026-06-17
> Périmètre de cette spec : **front-end complet en mock**, focus UI/UX. Le backend (auth, base de données, paiements, vidéo réelle) est explicitement reporté aux phases suivantes et n'est pas couvert ici.

## 1. Contexte

PNICE Academy est une plateforme de formation en ligne, extension de PNICE Shipping (logistique Miami–Haïti). Public : Haïtiens en Haïti + diaspora (USA, Canada, France). Elle enseigne des compétences numériques monétisables (outils financiers, e-commerce, shipping, marketing, IA). Ton de la copy : concret, voix active, sentence case, vocabulaire cohérent, pas de remplissage motivationnel.

## 2. Décisions validées (corrections incluses)

- **Périmètre** : construire toutes les pages clés en statique/mock. Aucun Clerk / Neon / Stripe / PayPal / MonCash / NatCash / crypto / Bunny branché. Les pages dépendantes du backend sont des coquilles visuelles complètes mais non fonctionnelles.
- **Prix unique pour tous** : suppression de la distinction local vs diaspora. Une formation = un seul prix pour tout le monde.
- **Modèle économique** : abonnement **79$/mois OU achat à l'unité à vie**. L'abonnement débloque tout le catalogue ; sinon on achète une formation seule à son prix unique. Les deux voies sont présentées côte à côte.
- **Équivalent gourdes** affiché partout où un montant USD apparaît, calculé via une constante de taux unique et modifiable.
- **Prix par formation** : chacune a son prix unique. Pour cette phase → **prix placeholder clairement marqués**, centralisés dans un fichier de données, faciles à remplacer par les vrais prix.
- **Direction visuelle** : **option B — concept « manifeste de cargaison » raffiné**. Même ADN que le brief (papier kraft, sceau, ocre) mais traitement premium : plus d'air, sceau élégant (pas un tampon brut), rouge en touche uniquement.
- **Langue par défaut** : **kreyòl (ht)** au premier chargement, bascule vers le français toujours disponible.

## 3. Fondation technique

- Next.js 14+ (App Router) + TypeScript.
- Tailwind CSS configuré avec tokens custom (pas les couleurs Tailwind par défaut).
- next-intl, routes localisées `/ht` (défaut) et `/fr`.
- shadcn/ui comme base, **restylé** avec les tokens (jamais le thème par défaut).
- Déploiement cible Vercel (non requis pour valider cette phase).

Raison du choix « vraie fondation tout de suite » : next-intl, les tokens et les composants sont réutilisés tels quels quand le backend arrivera ; on évite un recâblage aux phases suivantes.

## 4. Design system (Phase 0, avant toute page)

### Tokens couleurs
| Token | Hex | Usage |
|---|---|---|
| `--ink` | #10204A | texte principal, fonds sombres |
| `--paper` | #EDE6D6 | fond principal (variante raffinée = plus clair / plus d'air) |
| `--stamp-ochre` | #D98E2B | accent principal, CTA, prix, sceau |
| `--stamp-red` | #B23A2E | accent rare : urgence/validation, jamais en grande surface |
| `--route-teal` | #1F6E66 | liens, éléments secondaires |
| `--graphite` | #2B2B28 | texte de lecture longue sur fond clair |

### Typographie (3 rôles, jamais mélangés)
- **Big Shoulders** — titres (H1/H2) et sceau.
- **Work Sans** — texte courant (bon support des accents fr).
- **IBM Plex Mono** — données : codes de cours (PA-0X), prix, numéros de ligne.
- Chargement `display=swap`.

### Composant `<Sceau>` (élément signature, le seul élément audacieux)
- Sceau circulaire élégant, ocre, légère rotation optionnelle, plusieurs tailles.
- Variante raffinée : bord fin (pas de bord brut/irrégulier façon tampon encreur).
- Réutilisé pour : le « 9 fòmasyon » du hero, le code/prix de chaque formation, le badge « plas ki rete », le sceau de certificat.
- Tout le reste de l'UI (cartes, boutons, formulaires) reste sobre et discipliné autour de lui.

### Mouvement
- CSS pur (transitions + keyframes) + IntersectionObserver natif. **Pas de Framer Motion** ni librairie d'animation lourde.
- Séquence unique au chargement du hero : le sceau « s'imprime » (scale + légère rotation, ~280ms, easing doux).
- Révélation au scroll des lignes du catalogue (décalage 60–80ms par ligne).
- Survol des cartes : translateY léger + ombre douce (150–200ms).
- `@media (prefers-reduced-motion: reduce)` : désactiver translations/rotations, garder des fade discrets.

## 5. Pages (toutes bilingues ht/fr)

| Route | État | Contenu |
|---|---|---|
| `/ht` (défaut), `/fr` | Complète | Landing : nav + bascule langue → hero + sceau → manifeste des 9 formations → « poukisa ou bloke » (3 points concrets) → bloc crédibilité fondateur → témoignages → bannière places limitées → **pricing : abonnement 79$/mois vs à l'unité** → FAQ → CTA final + moyens de paiement |
| `/formations` | Complète | Catalogue, vue manifeste des 9 lignes (numérotées, prix en sceau) |
| `/formations/[slug]` | Complète | 9 pages détail : titre + code PA-0X, accroche, « sa w ap konn fè » (capacités concrètes), pour qui, plan de leçons, CTA achat |
| `/checkout` | Coquille UI | Choix abonnement ou formation + boutons moyens de paiement (PayPal, Visa/MC, MonCash, NatCash, Crypto) non fonctionnels |
| `/tableau-de-bord` | Coquille UI | Formations « achetées » (mock) + progression |
| `/tableau-de-bord/[course]/lecon/[id]` | Coquille UI | Lecteur vidéo factice + liste des leçons + progression |
| `/sign-in`, `/sign-up`, `/kont` | Coquille UI | Placeholders (vrai Clerk plus tard) |

## 6. Structure de la landing (ordre)

nav (logo + bascule fr/ht) → hero (titre, sous-titre, CTA, sceau « 9 fòmasyon », stats) → section « poukisa ou bloke » (3 points : pas d'accès aux paiements internationaux, ne sait pas acheter/vendre en ligne, pas de compétences techniques) → manifeste des 9 formations → bloc crédibilité fondateur → témoignages → bannière places limitées → **pricing (abonnement vs à l'unité)** → FAQ → CTA final + logos de paiement (texte : PayPal, Visa/Mastercard, MonCash, NatCash, Crypto).

## 7. Données mock (centralisées, faciles à éditer)

- `data/courses.ts` : les 9 formations. Champs : `code` (PA-0X), `slug`, `title_ht/fr`, `tagline_ht/fr`, `learn_points_ht/fr[]`, `audience_ht/fr`, `lessons[]` (titre ht/fr), `priceUsd` (**placeholder**), `icon` (Tabler). Contenu de départ = les 9 fiches du brief (PA-01 … PA-09).
- `data/pricing.ts` : `SUBSCRIPTION_USD = 79`, `USD_TO_HTG` (constante unique modifiable). Helper `toHTG(usd)` pour l'affichage de l'équivalent gourdes.
- `data/testimonials.ts` : **marqués `// EXEMPLE — À REMPLACER avant lancement`**. Jamais présentés comme réels.
- Compteur « plas ki rete » : valeur mock, **marquée à remplacer** par un vrai compteur avant lancement.

## 8. Copy / i18n

- Messages dans `messages/ht.json` et `messages/fr.json`.
- Registre : concret, voix active, sentence case, vocabulaire cohérent (un bouton « Kòmanse » reste « Kòmanse » partout).
- Taglines : HT « Bati lavi dijital ou, san limit » / FR « Bâtis ta vie numérique, sans limites ».

## 9. Performance (contexte Haïti)

`next/image` partout, lazy loading systématique, bundle JS minimal, zéro librairie d'animation lourde, polices `display=swap`, test mental en simulation 3G.

## 10. Explicitement reporté (hors de cette phase)

Auth Clerk réelle + webhooks, Neon/Drizzle + migrations, paiements réels (Stripe / PayPal / MonCash / NatCash / crypto + webhooks), vidéo Bunny réelle + tokens signés, génération de certificat PDF. Les pages concernées existent en coquille visuelle uniquement.

## 11. Checklist qualité (avant de considérer la phase livrée)

- [ ] Le site ne ressemble pas à un template générique (ni crème/serif, ni noir/accent acide, ni broadsheet).
- [ ] Le sceau est le seul élément audacieux ; tout le reste discipliné autour.
- [ ] Responsive jusqu'au mobile ; focus clavier visible sur tous les contrôles.
- [ ] `prefers-reduced-motion` respecté partout où il y a animation.
- [ ] Chaque texte respecte le registre (concret, voix active, sentence case, vocabulaire cohérent).
- [ ] Aucun faux témoignage ni faux chiffre présenté comme réel ; placeholders clairement marqués.
- [ ] Un seul prix par formation (pas de local/diaspora) ; équivalent gourdes affiché ; abonnement vs à l'unité présentés côte à côte.

## 12. Éléments à fournir par le client avant lancement public

- Prix réels des 9 formations (remplacer les placeholders dans `data/courses.ts`).
- Taux USD→HTG à jour (`USD_TO_HTG`).
- Vrais témoignages + vrai compteur de places.
- Médias (logo, visuels fondateur, vignettes de formations).
