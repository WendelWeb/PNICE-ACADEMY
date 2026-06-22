# PNICE Academy — Phase 2 backend

## État actuel (2026-06-20)

La **Partie A (schéma de données)** est écrite : [db/schema.ts](../db/schema.ts), client [db/index.ts](../db/index.ts), config [drizzle.config.ts](../drizzle.config.ts), scripts `db:generate` / `db:migrate` / `db:push` / `db:studio`.

⚠️ **Le reste de la Phase 2 (Parties B→G) n'est PAS construit** — et ne peut pas l'être tant que les dépendances externes ci-dessous ne sont pas fournies. Le prompt « tout le reste » supposait une « Phase 2 Lot 1 » (Neon + paiements + lecteur Bunny) qui n'avait jamais été réalisée. Ce schéma crée donc **tout** depuis zéro (tables de base + nouvelles tables).

## Décisions de schéma (quand l'instruction était implicite)

- **Contenu cours/leçons reste en code** (`data/courses.ts`). Les tables DB référencent un cours par `course_slug` (text) et une leçon par `lesson_index` (int) — pas de table `courses`/`lessons` ni de seed.
- **`referral_code` sur `users`** (source unique de vérité, prompt G1).
- **Accès à un cours** = ligne `subscriptions` active **OU** ligne `enrollments`.
- **Solde de crédit non dénormalisé** : `SUM(amount_cents)` sur `credit_ledger`.
- **`ON DELETE CASCADE`** sur les FK `user_id` → la suppression de compte (Phase 1 Lot 3) supprimera automatiquement enrollments/payments/subscriptions/certificates/etc. quand le webhook `user.deleted` effacera la ligne `users`.
- Montants en **cents (int)** + `currency` ; HTG dérivé au taux configuré (`NEXT_PUBLIC_USD_TO_HTG`).

## Étapes pour activer le schéma

1. Créer une base sur **neon.tech**, copier la connection string dans `.env.local` → `DATABASE_URL`.
2. `npm run db:push` (dev) ou `npm run db:generate && npm run db:migrate` (migrations versionnées).
3. `npm run db:studio` pour inspecter.

## ⛔ Bloqueurs externes avant de construire B→G (action humaine, hors code)

| Partie | Dépendance externe requise |
|---|---|
| **Tout** | **Neon Postgres** (`DATABASE_URL`) |
| Sync users (préalable) | **Webhook Clerk** `user.created/updated/deleted` (`CLERK_WEBHOOK_SECRET`, lib `svix`) |
| B — Abonnement/paiements | Comptes + clés **Stripe, PayPal, MonCash (Digicel), NatCash (Natcom), NOWPayments/Coinbase** ; webhooks de chaque provider |
| C — Lecteur vidéo | Compte **Bunny Stream** (`BUNNY_STREAM_API_KEY`, `LIBRARY_ID`) + **vidéos uploadées** + fichiers **.vtt** de sous-titres (fr/ht) par leçon |
| D — Certificats PDF | Lib de génération PDF (à installer) + stockage des PDF (Bunny/S3) |
| E — Notifications | Service **email** (Resend/…) **+ compte Meta Business vérifié + modèles WhatsApp approuvés** (démarche admin Meta, plusieurs jours) ; héberger le **cron** des rappels (Vercel Cron) |
| F — Support | Email interne de réception + numéro **WhatsApp** (`wa.me`) |

→ Tant que ces éléments ne sont pas en place, B→G resteraient du code non exécutable/non testable. À fournir avant de continuer.
