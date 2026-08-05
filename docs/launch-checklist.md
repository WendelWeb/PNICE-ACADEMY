# PNICE Academy — Runbook de lancement (étapes MANUELLES du propriétaire)

**Tout ce qui est codable est fait.** Ce document ne liste QUE ce qui dépend de
toi : acheter un domaine, créer des comptes externes, poser des clés, appliquer
les migrations, déployer. Chaque intégration est **inerte tant que sa clé n'est
pas posée** — l'app tourne aujourd'hui en mock sans planter. Statut live visible
sur **`/admin/sante → Branchement backend`**.

L'ordre ci-dessous est important (surtout la migration DB avant de basculer en réel).

*(Révisé — Stage 8, hygiène de lancement : ce document est réécrit pour
correspondre au code d'aujourd'hui de bout en bout — migrations à jour, 3
crons, le portail de facturation Stripe, le modèle de prix « deux pass »
avec ses vraies pages admin, le Token Authentication Bunny, et l'inventaire
complet des variables d'env.)*

---

## Étape 0 — Point de départ (déjà en place)

- `DATABASE_URL` (Neon), clés Clerk, `STRIPE_SECRET_KEY` : **posées**.
- Schéma DB de base : appliqué (via `db:push` d'une session précédente).
- **⚠ Migrations à jour ?** Vérifie — voir Étape 1 : ce dépôt contient
  aujourd'hui les migrations `0000` → `0018`. Si ta base n'a pas vu les
  dernières depuis un moment, relance simplement `npm run db:push` ; c'est
  additif et sans risque, une migration déjà appliquée est un no-op.

---

## Étape 1 — Appliquer les migrations DB **(à faire en premier, à chaque déploiement)**

```bash
npm run db:push
```

Une seule commande applique TOUTES les migrations manquantes (`0000` à
`0018` aujourd'hui), additif et sans risque — relance-la après chaque `git
pull` qui touche `db/migrations/`. **Obligatoire AVANT** : (a) tout test
webhook Stripe, (b) basculer `ADMIN_DATA_SOURCE=real`.

Ce que ces migrations débloquent, en gros : les tables du marketplace
enseignants (candidature, cours, leçons, avis, registre de gains, retraits —
voir « Marketplace enseignants » plus bas), les DEUX produits d'abonnement
(pass prof / Pass PNICE — voir Étape 9), la répartition pro-rata du Pass
PNICE, le contenu de site éditable (CMS textes/légal), et les protections
anti-double-charge du checkout (promo codes, garde-fou anti-rachat).

Une fois les migrations posées, active le marketplace :

```bash
npm run db:seed-courses  # écrit les 9 formations + leçons + plan $79/mo,
                          # ET seed ton profil enseignant #1 (idempotent)
```

Détails complets dans **« Marketplace enseignants »** plus bas.

---

## Étape 2 — Tester le paiement Stripe en réel (mode test)

1. Installe la **Stripe CLI** (https://stripe.com/docs/stripe-cli), puis `stripe login`.
2. Lance l'app : `npm run dev`.
3. Dans un autre terminal :
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   → copie le `whsec_…` affiché dans `.env.local` → `STRIPE_WEBHOOK_SECRET` (laisse la commande tourner).
4. Connecte-toi, va sur `/ht/checkout?course=zouti-finansye-dijital`, choisis
   **Visa / Mastercard**, paie avec la carte test `4242 4242 4242 4242` (date future, CVC au hasard).
5. Attendu : redirection vers `/ht/checkout/merci`, et le terminal `stripe listen`
   montre `checkout.session.completed → 200`.
6. Vérifie les écritures réelles :
   ```bash
   npm run db:check-payments
   ```
   → 1 paiement `completed` + 1 inscription `active` + logs webhook `processed`.
7. Refais depuis `/ht/checkout` (sans `?course=`) pour un **abonnement** (le
   choix par défaut est le Pass PNICE ; `?teacher=<slug>` cible le pass d'UN
   prof précis) → une ligne `subscriptions` avec `period_end` ~1 mois plus tard.
8. Rembourse le paiement du cours depuis le dashboard Stripe test → paiement
   `refunded`, inscription `refunded` dans le harness.

> **Pour la prod** : recrée l'endpoint webhook côté Stripe (Developers → Webhooks
> → `https://TON-DOMAINE/api/webhooks/stripe`) et mets SON `whsec_…` dans les
> variables d'env Vercel.

### Étape 2b — Activer le Portail de facturation Stripe (abonnements)

`/api/billing-portal` (le bouton « Gérer mon abonnement » côté `/kont`) ouvre
une session **Stripe Customer Portal** — Stripe exige que ce portail soit
**configuré au moins une fois côté dashboard avant de fonctionner en mode
live** (le mode test a une configuration par défaut automatique) :

1. Dashboard Stripe → **Settings → Billing → Customer portal**.
2. Active le portail, choisis ce qu'un abonné peut faire (annuler, changer
   de moyen de paiement — la mise à jour de plan n'est pas nécessaire, un
   abonnement PNICE est mono-plan par prof/plateforme).
3. **Save**. Refais ce réglage séparément en mode **live** avant le premier
   vrai abonné (le test et le live ont chacun leur propre configuration).

---

## Étape 3 — Acheter un domaine

Débloque : l'email (Resend exige SPF/DKIM sur un domaine vérifié), le webhook
Clerk (URL publique), et le déploiement prod.

**Dès que le domaine est acheté**, pose `NEXT_PUBLIC_SITE_URL` (`.env.local`
+ Vercel) = `https://TON-DOMAINE` (sans slash final). C'est la SEULE source
de vérité pour toute URL absolue que l'app construit — liens dans les
emails, `og:image` sur chaque partage WhatsApp/Facebook, `sitemap.xml`,
`robots.txt`, liens de vérification de certificat. Sans cette variable, tout
ça pointe silencieusement vers un domaine placeholder (`https://pnice.academy`)
que tu ne possèdes peut-être pas.

---

## Étape 4 — Email (Resend)

1. https://resend.com → **API Keys → Create** → `RESEND_API_KEY`.
2. **Domains → Add Domain** → configure les enregistrements DNS (SPF/DKIM) sur ton domaine.
3. `RESEND_FROM` = ex. `PNICE Academy <no-reply@ton-domaine.com>`.
4. Les envois sont **doublement protégés** : rien ne part sans la clé ET sans
   `ADMIN_DATA_SOURCE=real` (ou `EMAIL_LIVE=true` — utile pour tester un
   template vers TA PROPRE adresse pendant que le reste de l'app est encore
   en mock). Reçus (avec PDF), réponses de tickets, dunning, relances panier,
   digest : tout s'active alors.

---

## Étape 5 — Vidéo (Bunny)

1. https://dash.bunny.net → menu **Stream → Add Video Library**.
2. Onglet **API** de la librairie → `BUNNY_STREAM_API_KEY` + le **Library ID** → `BUNNY_STREAM_LIBRARY_ID`.
3. Une fois ces deux clés posées dans l'env (Vercel + `.env.local`), **l'upload vidéo
   devient autonome** : un prof (dans son studio) ou un admin (dans le CMS) choisit
   directement un fichier vidéo dans l'éditeur de leçon — il part du navigateur droit
   vers Bunny (Stream/TUS), et le champ `bunnyVideoId` de la leçon se remplit tout
   seul dès que l'envoi se termine. **Plus besoin de copier un GUID à la main** ; le
   champ + bouton "Valider" restent disponibles en repli si tu préfères coller un ID
   existant. Un prof ne voit jamais la clé Bunny et ne peut uploader que dans SES
   propres cours. Sans les deux clés ci-dessus, le contrôle d'upload affiche
   simplement "non configuré" (aucun crash) et le lecteur montre le placeholder.
4. **⚠ Sécurité paywall — Token Authentication (fait, à activer)** : par défaut
   l'embed est un lien public — quiconque a l'URL (visible dans le code source
   de la page) peut la regarder ou la repartager indéfiniment. C'est maintenant
   codé : pose **`BUNNY_EMBED_TOKEN_KEY`** pour signer chaque URL d'embed
   (expire après quelques heures — voir `lib/bunny/embed.ts`). Deux actions
   liées, à faire ENSEMBLE (l'une sans l'autre casse la lecture ou laisse le
   trou de sécurité ouvert) :
   1. Dashboard Bunny → ta librairie Stream → onglet **API** → section
      **Token Authentication** → active-la → copie la **clé**.
      → `BUNNY_EMBED_TOKEN_KEY` (Vercel + `.env.local`).
   2. Redéploie. Chaque nouvel embed généré porte désormais `token` + `expires`.
5. Test : `/admin/sante` → le check Bunny liste tes vidéos.

---

## Étape 5b — Fichiers : images de cours + ressources (Bunny Storage)

Le rail vidéo (Étape 5) utilise Bunny **Stream** ; les FICHIERS (photo de
couverture d'un cours, PDF/ressources téléchargeables) passent par Bunny
**Storage** — une zone à part, 3 valeurs à poser :

1. https://dash.bunny.net → menu **Storage → Add Storage Zone** (nom ex.
   `pnice-assets`, région par défaut) → le **nom** de la zone →
   `BUNNY_STORAGE_ZONE_NAME`.
2. Ouvre la zone → onglet **FTP & API Access** → copie le **Password** →
   `BUNNY_STORAGE_API_KEY`.
3. Menu **Pull Zones (CDN) → Add Pull Zone** → Origin Type **Storage Zone** →
   choisis ta zone → l'URL publique affichée (ex. `https://pnice-assets.b-cdn.net`)
   → `BUNNY_STORAGE_CDN_BASE`.
4. Pose les 3 valeurs dans `.env.local` + Vercel. Sans elles, **rien ne casse** :
   l'upload de fichiers répond simplement « non configuré » et le collage d'URL
   reste disponible. (Si tu as choisi une région NON par défaut à l'étape 1,
   pose aussi `BUNNY_STORAGE_HOST`, ex. `ny.storage.bunnycdn.com`.)

Les deux routes d'upload (`/api/upload/course-asset` et l'upload vidéo) sont
rate-limitées par IP (protection anti-abus basique, en mémoire par instance
— voir `lib/rate-limit.ts`) ; aucune action de ta part ici, c'est déjà actif.

---

## Étape 6 — Déployer (Vercel)

1. Pousse le code : `git push origin main`.
2. Vercel → **New Project** → importe le repo.
3. **Environment Variables** : recopie TOUTES tes clés `.env.local`. Check-list
   complète (voir `.env.example` pour le détail de chacune) :

   | Variable | Requis pour |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | Emails, og:image, sitemap, robots — Étape 3 |
   | `NEXT_PUBLIC_USD_TO_HTG` | Fallback d'affichage HTG (sinon 132) |
   | `ADMIN_DATA_SOURCE` | `real` pour sortir du mock — Étape 8 |
   | `DATABASE_URL` | Toute lecture/écriture réelle |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | Auth — Étape 7 |
   | `ADMIN_BOOTSTRAP_EMAILS`, `ADMIN_REQUIRE_2FA` | Accès admin — Étape 8 |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Paiement carte — Étape 2 |
   | `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_SOCIAL_*` | Footer/contact (optionnels) |
   | `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_LIVE` | Email — Étape 4 |
   | `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_EMBED_TOKEN_KEY` | Vidéo — Étape 5 |
   | `BUNNY_STORAGE_ZONE_NAME`, `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_CDN_BASE`, `BUNNY_STORAGE_HOST` | Fichiers — Étape 5b |
   | `CRON_SECRET` | Les 3 crons ci-dessous |

4. **Cron Jobs** : `vercel.json` déclare **3 crons** — active les Cron Jobs
   sur le projet Vercel (il pose `CRON_SECRET` automatiquement) :
   - `abandoned-carts` — toutes les 2h — relance panier abandonné.
   - `daily-digest` — 13h UTC/jour — résumé quotidien (ventes, tickets…).
   - `platform-pass-split` — le 2 de chaque mois, 6h UTC — calcule et
     verrouille la répartition pro-rata du mois précédent pour le Pass
     PNICE (voir `/admin/repartition`, Étape 9).

---

## Étape 7 — Webhook Clerk (après déploiement, besoin d'une URL publique)

1. Clerk Dashboard → **Webhooks → Add Endpoint** : `https://TON-DOMAINE/api/webhooks/clerk`.
2. Événements : `user.created`, `user.updated`, `user.deleted`.
3. Copie le **Signing Secret** (`whsec_…`) → `CLERK_WEBHOOK_SECRET`.
4. Backfill des comptes existants une fois : `npm run db:sync-clerk`.
   (Le webhook synchronise ensuite les NOUVEAUX comptes automatiquement, ET
   les mises à jour de profil via `user.updated` — nom/photo à jour sans
   resynchronisation manuelle.)

---

## Étape 8 — Basculer l'app en réel

1. **Après l'Étape 1** (migrations appliquées) : mets `ADMIN_DATA_SOURCE=real`.
   Tout l'admin lit alors Postgres ; le journal d'audit, les certificats
   réels, les ventes réelles apparaissent.
2. `ADMIN_BOOTSTRAP_EMAILS=ton-email` → te donne super-admin au premier passage sur `/admin`.
3. `ADMIN_REQUIRE_2FA=true` → réactive la 2FA admin (désactivée pendant le dev).

---

## Étape 9 — Contenu & décisions

- **Prix réels** : remplace les placeholders ($7–49) dans `data/courses.ts` (`priceUsd`).
- **Modèle de prix « deux pass »** — chacun a maintenant son propre écran, plus
  besoin de toucher la base à la main :
  - **Pass prof** (`subscriptions.kind = 'teacher'`, donne accès à UN SEUL
    prof) : chaque prof fixe SON prix depuis son studio
    (`/enseigner/studio` → formulaire de prix de plan,
    `components/teacher/studio/PlanPricingForm.tsx`).
  - **Pass PNICE** (`subscriptions.kind = 'platform'`, donne accès à TOUT le
    catalogue) : prix fixé par toi sur **`/admin/prix`**.
  - **Taux de change USD→HTG** (affichage live sur tout le site une fois
    `ADMIN_DATA_SOURCE=real`) : **`/admin/taux`**. Sans base réelle, le
    fallback est `NEXT_PUBLIC_USD_TO_HTG` (Étape 0 de `.env.example`).
  - **Répartition du Pass PNICE** : chaque mois, le revenu du Pass PNICE est
    reparti au pro-rata entre les profs dont un abonné a suivi les cours —
    calculée automatiquement par le cron `platform-pass-split` (Étape 6), et
    consultable/déclenchable manuellement sur **`/admin/repartition`**
    (aperçu avant calcul, historique immuable après).
  - **Commission (30 %), seuil de retrait (25 $), quota vidéo par défaut
    (600 min)** : ces trois réglages `platform_settings` n'ont **pas encore**
    d'écran admin dédié (contrairement au prix/taux/répartition ci-dessus) —
    modifie-les via `npm run db:studio` → table `platform_settings` →
    `commission_pct` / `payout_threshold_cents` / `default_video_quota_minutes`.
    Valeurs par défaut déjà correctes pour lancer, aucune action requise tant
    que tu ne veux pas les changer.
- **Enregistre tes cours** (Étape 5) — le goulot d'étranglement réel.
- **MonCash / NatCash** : différés (aucun code, pas de rail actif). Lancement
  **carte uniquement** via Stripe ; on ajoutera les rails haïtiens ensuite.

---

## Étape 10 — Vérifs manuelles avant d'ouvrir au public

Ces points n'ont pas pu être testés automatiquement (base quasi vide) :

- **Accès payant** : insère à la main une inscription (ou fais un vrai achat test),
  confirme que le cours apparaît sur `/tableau-de-bord` et que ses leçons sont
  accessibles ; qu'un cours NON acheté redirige vers la page de vente.
- **Certificat** : termine toutes les leçons d'un cours de test → un certificat
  doit s'émettre ; ouvre `/api/certificate/<code>` pour vérifier le PDF, et
  `/certificats/verifier/<code>` pour la page publique.
- **Greeting multi-user** : connecte 2 comptes différents, confirme que le nom du
  tableau de bord diffère (pas de cache partagé).
- **Crons** : déclenche chacun des 3 manuellement une fois en prod, ex. :
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://TON-DOMAINE/api/cron/daily-digest
  curl -H "Authorization: Bearer $CRON_SECRET" https://TON-DOMAINE/api/cron/abandoned-carts
  curl -H "Authorization: Bearer $CRON_SECRET" https://TON-DOMAINE/api/cron/platform-pass-split
  ```
- **404 / erreurs** : ouvre une URL qui n'existe pas (`/ht/xyz-inexistant`) →
  page 404 de marque, pas la page blanche par défaut de Next. `/sitemap.xml`
  et `/robots.txt` répondent (pas de 404 dessus non plus).
- **Favicon** : recharge n'importe quelle page, l'onglet du navigateur montre
  le sceau « PA », pas le globe générique par défaut.

---

## Marketplace enseignants (C3)

C2 (cours/leçons en base) et C3 (onboarding enseignant, studio, validation,
registre 70/30, retraits, avis) sont **codés et prêts** — cette section les
active. Fait après l'Étape 1 :

```bash
npm run db:push          # applique toutes les migrations (voir Étape 1)
npm run db:seed-courses  # écrit les 9 formations + leçons + plan $79/mo,
                          # ET seed maintenant ton profil enseignant #1
```

`db:seed-courses` upsert désormais aussi UNE ligne `teacher_profiles` pour toi
(le propriétaire résolu) : `display_name` + bio ht/fr (depuis `data/teachers.ts`),
`status = 'approved'` (pré-approuvé — tu ne passes pas par `/enseigner` comme
les autres), quota vidéo 600 min. **Idempotent et non-destructif** : si ta ligne
existe déjà (tu l'as modifiée depuis — statut suspendu, infos de paiement
ajoutées…), un re-run de `db:seed-courses` ne l'écrase JAMAIS ; seul un premier
run crée la ligne.

Une fois les deux commandes lancées, le marketplace est actif de bout en bout :

- **Candidature** : un compte connecté postule sur `/enseigner` (bio ht/fr,
  méthode de paiement, CGU).
- **Approbation** : toi (ou un admin) approuves/rejettes sur
  `/admin/enseignants` (cap `teachers.review`).
- **Studio** : un enseignant approuvé obtient `/enseigner/studio` — crée/édite
  SES cours, les soumet en révision (jamais d'auto-publication : toi seul
  publies, depuis `/admin/cours` → onglet « à valider »), fixe le prix de son
  propre pass (voir Étape 9), voit son solde + registre de gains, demande un
  retrait.
- **Argent** : chaque vente écrit une ligne `earnings_ledger` — 70 % net pour
  l'enseignant, 30 % de commission, **figée au moment de la vente** (changer le
  taux plus tard ne touche jamais les ventes déjà faites). Le Pass PNICE, lui,
  se répartit mensuellement au pro-rata — voir Étape 9 / `/admin/repartition`.
- **Retraits** : manuels, sur demande (≥ seuil), traités sur `/admin/retraits`
  (cap `payouts.process`) — tu payes hors-app (MonCash/NatCash/PayPal/virement)
  puis marques la demande « payée » avec une référence.
- **Avis** : un apprenant inscrit note 1-5 étoiles + commentaire sur un cours
  acheté ; visible sur la page de vente et `/prof/[slug]`.

**Réglages par défaut (déjà dans le schéma `platform_settings`, aucune action
requise pour lancer)** : commission = **30 %**, seuil de retrait = **25 $**,
quota vidéo par défaut = 600 min — voir Étape 9 pour comment (et où) changer
chaque réglage de `platform_settings`, prix inclus.

**⚠ Ton profil enseignant #1 est seedé SANS méthode de paiement** (tu n'es
jamais passé par le formulaire de candidature, qui est la seule UI qui les
renseigne aujourd'hui). Tant que `payout_method`/`payout_destination` restent
vides, une demande de retrait pour TOI-MÊME échoue (`no_payout_method`) — ça
ne bloque rien au lancement, seulement le jour où tu voudras te retirer un
premier paiement. Renseigne les deux champs via `db:studio` (table
`teacher_profiles`, ta ligne) à ce moment-là. Les autres enseignants, eux,
les configurent normalement dans l'assistant `/enseigner`.

---

## Résumé — la porte de lancement

`/admin/sante → Branchement backend` affiche **« Prêt »** quand : DB + Clerk +
webhook Clerk configurés **+** `ADMIN_DATA_SOURCE=real` **+** au moins un rail de
paiement live. Chemin le plus court vers de l'argent réel : Étapes 1→2 (paiement),
4 (email), 5 (vidéo), 6 (déploiement), 9 (prix). Le reste peut suivre juste après.

**Marketplace enseignants (C2+C3)** : codé et prêt, voir la section
« Marketplace enseignants (C3) » ci-dessus pour l'activer (`db:push` +
`db:seed-courses`). Specs dans `docs/superpowers/`.
