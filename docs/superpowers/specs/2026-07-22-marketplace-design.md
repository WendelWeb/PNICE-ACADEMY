# PNICE Academy — Marketplace multi-enseignants + finition produit — Design

**Date : 2026-07-22 · Statut : validé en brainstorming avec le propriétaire (décisions déléguées tranchées par Claude, marquées « [décision] »)**

## 1. Vision

PNICE Academy passe de « plateforme des cours de Stanley » à **marketplace uniforme** :
tout compte peut devenir enseignant, créer des cours, fixer ses prix. Le propriétaire
devient simplement **l'enseignant #1** — aucun cas spécial dans le code.

### Décisions validées par le propriétaire

| Sujet | Décision |
|---|---|
| Monétisation par enseignant | À l'unité **+** bundles **+** abonnement mensuel propre (le prof choisit quels cours y entrent) |
| Abonnement $79 actuel | Devient le `teacher_plan` de l'enseignant #1 (modèle uniforme) |
| Commission plateforme | **30%** sur chaque vente (unité, bundle, renouvellement d'abonnement) |
| Reversements | **Retrait à la demande** dès un seuil atteint ; file traitée manuellement dans l'admin (Stripe Connect indisponible en Haïti) |
| Modération | **Validation admin de chaque cours** (et des grosses mises à jour) avant publication |
| Séquence | **Approche C** : rails partagés → pivot cours-DB → couche marketplace |

### Décisions déléguées [décision]

- **Rails v1 = Stripe (carte) + MonCash.** PayPal, crypto (NOWPayments), NatCash,
  WhatsApp : coupés du lancement (aucun code n'existe ; NatCash sans portail dev ;
  chaque rail = des semaines). NatCash reviendra dès l'obtention du compte marchand.
- **Abonnements par carte uniquement** (MonCash ne fait pas de récurrent). Un
  visiteur sans carte voit « à l'unité / bundle » avec un message clair.
- **Commission figée à la vente** : chaque entrée du registre stocke le taux appliqué.
  Changer le taux n'affecte que les ventes futures.
- **Seuil de retrait : $25** (modifiable dans `platform_settings`).
- **Quota vidéo par enseignant** (minutes de vidéo stockées), défaut modifiable —
  contrôle des coûts Bunny.
- **Profil enseignant approuvé avant le premier cours** (anti-fraude, marque).
- **Certificats co-brandés** : « PNICE Academy — [nom de l'enseignant] ».
- **Remboursement = entrée négative au registre** ; solde négatif comblé par les
  ventes futures avant tout retrait.

## 2. Séquence de construction (3 sous-projets, un plan d'implémentation chacun)

### C1 — Rails partagés (nécessaires dans tous les mondes, zéro travail jeté)

1. **Checkout serveur** : `POST /api/checkout` (produit + promo) → ligne
   `checkout_sessions` → session Stripe Checkout ou paiement MonCash → redirect.
2. **Webhooks** : `/api/webhooks/stripe` + `/api/webhooks/moncash` — vérification de
   signature, idempotence (`webhook_logs`), écriture `payments` → `enrollments` /
   `subscriptions`, rédemption promo + crédit parrainage, email reçu.
3. **Abonnement récurrent** via Stripe Billing (renouvellements, échecs → dunning réel).
4. **`realDataSource()` complet** : transactions, abonnements, analytics, engagement,
   certificats, marketing, support (le domaine users est déjà réel). TDD contre la DB
   live, comme users. `ADMIN_DATA_SOURCE=real` définitif.
5. **Vidéo Bunny** : re-poser les clés, upload réel (CMS), lecteur signé dans les
   leçons, sous-titres .vtt (ht/fr) par leçon.
6. **Email Resend** : achat domaine, clés, activation des envois câblés + stubs
   (relance panier, annonces, digest). **Crons Vercel** : paniers 2h, digest quotidien.
7. **PDF** : reçus + certificats (page publique de vérification déjà en place).
8. **Ops** : déploiement Vercel, `CLERK_WEBHOOK_SECRET`, capture UTM réelle à
   l'inscription, ingestion des logs d'erreurs, 2FA admin réactivée, taux USD→HTG
   unifié dans `platform_settings`, commit propre de l'existant.

### C2 — Pivot cours → DB (marketplace-ready dès le premier jour)

1. Tables `courses` + `lessons` en DB (schéma §3) avec `owner_user_id`, statuts et
   champs de validation — même si le seul owner est l'enseignant #1.
2. Seed : migration des 9 cours de `data/courses.ts` + `data/courseDetails.ts` vers la
   DB sous le compte du propriétaire (statut `published`).
3. Site public branché sur la DB (catalogue, fiche cours, leçons) ;
   `data/courses.ts` retiré. Textes « 9 formations » dynamisés.
4. CMS admin re-branché du store en mémoire vers la DB (mêmes écrans, mêmes
   composants) — l'aperçu admin devient la vraie publication.
5. `enrollments`/`certificates` : `course_slug` → `course_id` (FK), + `source`
   (achat / bundle / abonnement / offert).
6. `subscriptions` rattachées à `teacher_plans` ; le $79 = plan #1 seedé.

### C3 — Couche marketplace

1. **Onboarding enseignant** : « Devenir enseignant » depuis `/kont` → profil
   (nom, bio ht/fr, photo), méthode de retrait, acceptation des conditions →
   statut `pending` → approbation admin.
2. **Studio enseignant** (`/enseigner`, protégé, réutilise les composants CMS admin
   scoped au owner) : mes cours (CRUD + soumission à validation), bundles, mon
   abonnement (prix + cours inclus), mes ventes, mon solde, mes retraits, quota vidéo.
3. **Validation admin** : file `pending_review` (approuver / rejeter avec note
   bilingue). Déclenchent une re-validation d'un cours publié : changement de prix,
   ajout/suppression/remplacement de leçon ou de vidéo. Ne déclenchent pas :
   corrections de texte mineures (typos, description). La version publiée reste en
   ligne pendant la revue.
4. **Registre + retraits** : `earnings_ledger` alimenté par les webhooks (70/30) ;
   demande de retrait (≥ seuil) → file admin → marquer payé (MonCash/NatCash/
   PayPal/virement, référence manuelle) → débit du registre. Audit sur tout.
5. **Public** : page vitrine `/prof/[slug]` (bio, cours, bundles, abonnement),
   catalogue filtrable par enseignant, fiche cours avec bloc enseignant.
6. **Admin étendu** : liste enseignants (approbation, suspension), file retraits,
   commission dans `/admin/plateforme`, analytics par enseignant, abonnements
   multi-plans.

**En parallèle de C1→C3 : le propriétaire enregistre ses cours.** Dès la fin de C3,
d'autres enseignants remplissent le catalogue pendant ces enregistrements.

## 3. Modèle de données

### Nouvelles tables

- **`teacher_profiles`** — `user_id` (FK unique), `display_name`,
  `bio_ht`/`bio_fr`, `photo_url`, `status` (`pending`/`approved`/`suspended`),
  `payout_method` (`moncash`/`natcash`/`paypal`/`bank`), `payout_destination`,
  `video_quota_minutes`, `terms_accepted_at`, timestamps.
- **`courses`** — `id`, `owner_user_id`, `slug` (unique), `code`, titres/descriptions
  bilingues, champs de la fiche de vente (promesse, problème, livrables, prérequis,
  FAQ — bilingues, comme le CMS actuel), `price_cents`, `currency`, images,
  `status` (`draft`/`pending_review`/`published`/`rejected`/`archived`),
  `review_note`, `submitted_at`, `reviewed_by`, `published_at`,
  `has_unpublished_changes`, timestamps.
- **`lessons`** — `course_id`, `index`, titres bilingues, `bunny_video_id`,
  `duration_seconds`, `is_preview`, timestamps.
- **`bundles`** — `owner_user_id`, titres bilingues, `course_ids` (jsonb, cours du
  même enseignant uniquement), `price_cents`, `status` (même cycle de validation),
  timestamps.
- **`teacher_plans`** — `owner_user_id`, titres bilingues, `price_cents_monthly`,
  `includes_all` (bool) ou `course_ids` (jsonb), `stripe_product_id`/
  `stripe_price_id`, `status`, timestamps. Un plan actif max par enseignant (v1).
- **`earnings_ledger`** — `teacher_user_id`, `payment_id` (nullable pour
  ajustements), `kind` (`sale`/`refund`/`withdrawal`/`adjustment`),
  `gross_cents`, `commission_pct_applied`, `commission_cents`, `net_cents`
  (négatif pour refund/withdrawal), `currency`, `note`, `created_at`.
  **Solde = SUM(net_cents)** — jamais dénormalisé.
- **`withdrawal_requests`** — `teacher_user_id`, `amount_cents`, `method`,
  `destination_snapshot`, `status` (`pending`/`paid`/`rejected`),
  `processed_by`, `processed_at`, `reference`, `note`, timestamps.

### Tables existantes modifiées

- `enrollments`, `certificates`, `payments` (lignes produit) : `course_slug` →
  `course_id` FK ; `enrollments.source` (`purchase`/`bundle`/`subscription`/`granted`).
- `subscriptions` : + `teacher_plan_id` FK.
- `payments` : + `product_kind` (`course`/`bundle`/`plan`), `product_id`,
  `teacher_user_id` (dénormalisé pour requêtes de reporting).
- `platform_settings` : + `commission_pct` (30), `payout_threshold_cents` (2500),
  `default_video_quota_minutes`, `usd_to_htg_rate` (source unique du taux).
- `checkout_sessions` : + `product_kind`/`product_id`.

## 4. Flux d'argent

1. **Achat** : checkout → session provider → webhook vérifié → `payments` →
   `enrollments` (cours, ou chaque cours du bundle) / `subscriptions` (plan) →
   **entrée `earnings_ledger`** (brut, 30% commission figée, 70% net au prof) →
   promo/parrainage → email reçu + PDF.
2. **Renouvellement d'abonnement** : webhook `invoice.paid` Stripe → `payments` +
   entrée registre à chaque cycle. Échec → dunning (emails réels + admin).
3. **Remboursement** : action admin existante étendue → refund provider → entrée
   registre négative → révocation d'accès selon la politique existante.
4. **Retrait** : solde ≥ seuil → demande depuis le studio → file admin →
   paiement manuel hors-plateforme → « payé » (+ référence) → entrée
   `withdrawal` négative. Garde-fous : une seule demande `pending` par prof,
   montant ≤ solde, audit.

## 5. Permissions & sécurité

- Studio : tout utilisateur avec `teacher_profiles.status=approved` ; chaque action
  serveur vérifie `owner_user_id` = user courant.
- Nouvelles capacités admin : `teachers.review` (validation cours + profils),
  `payouts.process` (file retraits) — super-admin + admin ; support en lecture.
- Le registre n'est modifiable que par les webhooks, le refund admin et le
  traitement de retrait — jamais par l'enseignant.
- Vidéos Bunny : lecture par URL signée, upload limité au quota du prof.
- Aucun secret exposé ; `integrations.ts` étendu (moncash requis-si-activé, etc.).

## 6. Tests & rollout

- Même méthode que le domaine users : **TDD contre la DB live** (harness dotenv),
  mock conservé comme référence de contrat et rollback (`ADMIN_DATA_SOURCE`).
- Webhooks : tests d'idempotence (relivraison), signatures invalides, montants.
- Registre : propriété « somme des entrées = solde affiché » vérifiée par harness.
- Rollout : C1 activable en prod sans marketplace ; C2 derrière un seed vérifié
  (comparaison DB vs `data/courses.ts` avant bascule) ; C3 activable enseignant
  par enseignant (approbation manuelle = feature-flag naturel).

## 7. Hors-scope v1 (différé, volontairement)

PayPal, crypto (NOWPayments), NatCash, WhatsApp Business, avis/notes sur les cours,
messagerie élève↔prof, quiz/devoirs, affiliation par prof, app mobile, retraits
automatisés, plans annuels, coupons par enseignant (les promos restent plateforme
en v1).

## 8. Paramètres à fixer par le propriétaire avant lancement

Prix réels des cours (placeholders actuellement), achat du domaine (email),
compte MonCash Business, valeur du quota vidéo par défaut, texte des conditions
enseignants (juridique).
