# Guide — obtenir chaque clé API

Toutes les valeurs vont dans `.env.local` (jamais commité). Voir `.env.example`
pour la liste des noms. Statut config visible sur `/admin/sante → Branchement`.

---

## Déjà posées ✅

### `DATABASE_URL` (Neon)
1. https://neon.tech → crée un compte → **New Project**.
2. Projet → **Dashboard** → **Connection string**.
3. Choisis **Pooled connection** → copie la chaîne `postgresql://…`.
4. Colle dans `DATABASE_URL`.

### `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (Clerk)
1. https://dashboard.clerk.com → ton application → **API keys**.
2. Copie **Publishable key** (`pk_…`) → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
3. Copie **Secret key** (`sk_…`) → `CLERK_SECRET_KEY`.

### `STRIPE_SECRET_KEY` (Stripe)
1. https://dashboard.stripe.com → active **Test mode** (interrupteur en haut à droite).
2. **Developers → API keys** → **Secret key** (`sk_test_…`) → *Reveal* → copie.
3. Colle dans `STRIPE_SECRET_KEY`.

---

## À poser (sans domaine)

### `STRIPE_WEBHOOK_SECRET` (Stripe)
Deux façons :

**A. Endpoint en ligne (quand l'app est déployée sur Vercel)**
1. Stripe (Test mode) → **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL** : `https://TON-APP.vercel.app/api/webhooks/stripe`.
3. **Select events** : coche au moins
   `checkout.session.completed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `charge.refunded`.
4. **Add endpoint** → sur la page de l'endpoint, section **Signing secret** →
   *Reveal* → copie `whsec_…` → `STRIPE_WEBHOOK_SECRET`.

**B. En local (sans URL publique) — Stripe CLI**
1. Installe la **Stripe CLI** (https://stripe.com/docs/stripe-cli).
2. `stripe login`.
3. `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
4. La commande affiche `whsec_…` → colle dans `STRIPE_WEBHOOK_SECRET`.
   (Laisse la commande tourner pendant les tests locaux.)

### `BUNNY_STREAM_API_KEY` + `BUNNY_STREAM_LIBRARY_ID` (Bunny)
⚠️ Utilise la clé **de la librairie Stream**, PAS la clé API du compte.
1. https://dash.bunny.net → crée un compte.
2. Menu **Stream** → **Add Video Library** → nom + régions → **Add**.
3. Ouvre la librairie → onglet **API** (ou **Security / API**).
4. Copie l'**API Key** de la librairie → `BUNNY_STREAM_API_KEY`.
5. Le **Library ID** (nombre) est affiché en haut de la librairie / dans l'URL /
   dans l'onglet API → `BUNNY_STREAM_LIBRARY_ID`.
6. Test : `/admin/sante` → le check Bunny doit lister tes vidéos.

### `CLERK_WEBHOOK_SECRET` (Clerk) — besoin d'une URL publique
1. Il faut une URL joignable : soit l'app **déployée** (`*.vercel.app`), soit un
   tunnel local (`ngrok http 3000`).
2. Clerk Dashboard → **Configure → Webhooks → Add Endpoint**.
3. **Endpoint URL** : `https://…/api/webhooks/clerk`.
4. **Subscribe to events** : `user.created`, `user.updated`, `user.deleted`.
5. **Create** → la page affiche **Signing Secret** (`whsec_…`) → copie →
   `CLERK_WEBHOOK_SECRET`.
6. (Le backfill des comptes existants est déjà fait via `npm run db:sync-clerk` ;
   le webhook sert à synchroniser les NOUVEAUX comptes.)

### `MONCASH_CLIENT_ID` + `MONCASH_CLIENT_SECRET` (Digicel MonCash)
MonCash exige un **compte MonCash Business**. Pas de portail dev 100% self-serve
— prévois d'échanger avec le support business Digicel si la section API n'apparaît
pas.
1. Ouvre un **compte MonCash Business** (Digicel Haïti).
2. Portail business : `https://moncashbutton.digicel.com/Moncash-business`
   (bac à sable : `https://sandbox.moncashbutton.digicel.com/Moncash-business`).
3. Dans le portail → section **Business/API keys** (ou « Créer une application ») →
   génère les identifiants → copie **Client ID** et **Client Secret**.
4. Colle dans `MONCASH_CLIENT_ID` / `MONCASH_CLIENT_SECRET`.
5. Si tu ne vois pas la section API : contacte le support MonCash Business pour
   activer l'accès API marchand.

### `NATCASH_API_KEY` (Natcom NatCash)
NatCash n'a **pas** de portail développeur public documenté. L'accès API passe
par un **compte marchand Natcom** et une demande directe.
1. Contacte **Natcom / NatCash** (service marchand/entreprise) pour un compte
   marchand + accès API.
2. Ils fournissent la/les clé(s) marchand → `NATCASH_API_KEY`.
3. À poser plus tard si tu n'as pas encore le compte — le code reste inerte sans.

---

## À reporter (exige un domaine acheté) ⏸️

### `RESEND_API_KEY` + `RESEND_FROM` (Resend)
1. https://resend.com → compte → **API Keys → Create API Key** → `RESEND_API_KEY`.
2. **Domains → Add Domain** → ajoute ton domaine → configure les enregistrements
   DNS (SPF/DKIM) fournis. **C'est cette étape qui exige d'avoir acheté un domaine.**
3. `RESEND_FROM` = ex. `PNICE Academy <no-reply@ton-domaine.com>`.
4. Sans domaine vérifié, l'envoi ne marche pas → on garde l'email en no-op sûr.

---

## Ordre conseillé
1. `ADMIN_DATA_SOURCE=real` (voir tes vrais users tout de suite).
2. `BUNNY_*` (activation immédiate du health-check).
3. `STRIPE_WEBHOOK_SECRET` (au moment du build paiement).
4. `CLERK_WEBHOOK_SECRET` (quand l'app est déployée).
5. `MONCASH_*` / `NATCASH_*` (comptes marchands).
6. `RESEND_*` (après achat du domaine).
