# PNICE Academy — Runbook de lancement (étapes MANUELLES du propriétaire)

**Tout ce qui est codable est fait.** Ce document ne liste QUE ce qui dépend de
toi : acheter un domaine, créer des comptes externes, poser des clés, appliquer
les migrations, déployer. Chaque intégration est **inerte tant que sa clé n'est
pas posée** — l'app tourne aujourd'hui en mock sans planter. Statut live visible
sur **`/admin/sante → Branchement backend`**.

L'ordre ci-dessous est important (surtout la migration DB avant de basculer en réel).

---

## Étape 0 — Point de départ (déjà en place)

- `DATABASE_URL` (Neon), clés Clerk, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_USD_TO_HTG` : **posées**.
- Schéma DB de base : appliqué (via `db:push` d'une session précédente).
- **⚠ Migrations non encore appliquées** à la base live : `0002` (contraintes
  uniques anti-doublon paiement), `0003` (certificat unique par user+cours),
  `0004` (colonne `certificates.revoked`). → voir Étape 1.

---

## Étape 1 — Appliquer les migrations DB **(à faire en premier)**

```bash
npm run db:push
```

Ça applique 0002 + 0003 + 0004 à ta base Neon (additif, sans risque).
**Obligatoire AVANT** : (a) tout test webhook Stripe, (b) basculer
`ADMIN_DATA_SOURCE=real`. Sans `0004`, les lectures réelles de certificats/cours
plantent (colonne `revoked` manquante).

**Depuis, `db:push` applique aussi 0005-0009** (cours/leçons/plan enseignant,
puis les 5 tables du marketplace enseignants + leurs index anti-doublon) —
même commande, toujours additive. Voir **« Marketplace enseignants (C3) »**
plus bas pour l'activer une fois ces migrations pushées.

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
7. Refais depuis `/ht/checkout` (sans `?course=`) pour l'**abonnement** → une ligne
   `subscriptions` avec `period_end` ~1 mois plus tard.
8. Rembourse le paiement du cours depuis le dashboard Stripe test → paiement
   `refunded`, inscription `refunded` dans le harness.

> **Pour la prod** : recrée l'endpoint webhook côté Stripe (Developers → Webhooks
> → `https://TON-DOMAINE/api/webhooks/stripe`) et mets SON `whsec_…` dans les
> variables d'env Vercel.

---

## Étape 3 — Acheter un domaine

Débloque : l'email (Resend exige SPF/DKIM sur un domaine vérifié), le webhook
Clerk (URL publique), et le déploiement prod.

---

## Étape 4 — Email (Resend)

1. https://resend.com → **API Keys → Create** → `RESEND_API_KEY`.
2. **Domains → Add Domain** → configure les enregistrements DNS (SPF/DKIM) sur ton domaine.
3. `RESEND_FROM` = ex. `PNICE Academy <no-reply@ton-domaine.com>`.
4. Les envois sont **doublement protégés** : rien ne part sans la clé ET sans
   `ADMIN_DATA_SOURCE=real` (ou `EMAIL_LIVE=true` pour tester vers une adresse à toi).
   Reçus (avec PDF), réponses de tickets, dunning, relances panier, digest : tout s'active alors.

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
4. **⚠ Sécurité paywall** : l'embed est public par défaut — quiconque a l'URL peut
   regarder. **Active Token Authentication OU une restriction par referrer dans le
   dashboard Bunny** avant de publier des vidéos payantes.
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

---

## Étape 6 — Déployer (Vercel)

1. Pousse le code : le remote existe (`WendelWeb/PNICE-ACADEMY`) mais tout est
   local (`git push origin main`).
2. Vercel → **New Project** → importe le repo.
3. **Environment Variables** : recopie toutes tes clés `.env.local`.
4. **Cron Jobs** : `vercel.json` déclare déjà les 2 crons (relance panier toutes
   les 2h, digest quotidien) — Vercel pose `CRON_SECRET` automatiquement quand tu
   actives les Cron Jobs.

---

## Étape 7 — Webhook Clerk (après déploiement, besoin d'une URL publique)

1. Clerk Dashboard → **Webhooks → Add Endpoint** : `https://TON-DOMAINE/api/webhooks/clerk`.
2. Événements : `user.created`, `user.updated`, `user.deleted`.
3. Copie le **Signing Secret** (`whsec_…`) → `CLERK_WEBHOOK_SECRET`.
4. Backfill des comptes existants une fois : `npm run db:sync-clerk`.
   (Le webhook synchronise ensuite les NOUVEAUX comptes automatiquement.)

---

## Étape 8 — Basculer l'app en réel

1. **Après l'Étape 1** (migrations appliquées) : mets `ADMIN_DATA_SOURCE=real`.
   Tout l'admin (75/75 domaines) lit alors Postgres ; le journal d'audit, les
   certificats réels, les ventes réelles apparaissent.
2. `ADMIN_BOOTSTRAP_EMAILS=ton-email` → te donne super-admin au premier passage sur `/admin`.
3. `ADMIN_REQUIRE_2FA=true` → réactive la 2FA admin (désactivée pendant le dev).

---

## Étape 9 — Contenu & décisions

- **Prix réels** : remplace les placeholders ($7–49) dans `data/courses.ts` (`priceUsd`).
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
- **Crons** : déclenche-les manuellement une fois en prod
  (`curl -H "Authorization: Bearer $CRON_SECRET" https://TON-DOMAINE/api/cron/daily-digest`).

---

## Marketplace enseignants (C3)

C2 (cours/leçons en base) et C3 (onboarding enseignant, studio, validation,
registre 70/30, retraits, avis) sont **codés et prêts** — cette section les
active. Fait après l'Étape 1 :

```bash
npm run db:push          # applique 0005-0009 (voir Étape 1)
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
  publies, depuis `/admin/cours` → onglet « à valider »), voit son solde +
  registre de gains, demande un retrait.
- **Argent** : chaque vente écrit une ligne `earnings_ledger` — 70 % net pour
  l'enseignant, 30 % de commission, **figée au moment de la vente** (changer le
  taux plus tard ne touche jamais les ventes déjà faites).
- **Retraits** : manuels, sur demande (≥ seuil), traités sur `/admin/retraits`
  (cap `payouts.process`) — tu payes hors-app (MonCash/NatCash/PayPal/virement)
  puis marques la demande « payée » avec une référence.
- **Avis** : un apprenant inscrit note 1-5 étoiles + commentaire sur un cours
  acheté ; visible sur la page de vente et `/prof/[slug]`.

**Réglages par défaut (déjà dans le schéma `platform_settings`, aucune action
requise pour lancer)** : commission = **30 %**, seuil de retrait = **25 $**,
quota vidéo par défaut = 600 min. Pour les changer, il n'y a pas encore d'écran
admin dédié — modifie la ligne singleton directement : `npm run db:studio` →
table `platform_settings` → `commission_pct` / `payout_threshold_cents` /
`default_video_quota_minutes`.

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
