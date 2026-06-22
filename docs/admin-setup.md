# Admin — mise en place (Phase A, Lot 1)

Le tableau de bord admin vit sous `/{locale}/admin` (ex. `/ht/admin`, `/fr/admin`).
Il est **distinct** du site public : sa propre coquille (barre latérale + en-tête),
sans le langage visuel « manifeste de cargaison ». Données **mock** pour l'instant.

## Conditions d'accès (deux barrières)

Un compte ne peut entrer dans `/admin` que si **les deux** sont vraies :

1. **Rôle admin** sur `publicMetadata.role` (côté serveur uniquement) parmi :
   `super-admin`, `admin`, `support`, `editeur-contenu`.
2. **2FA activée** sur le compte (vérification en deux étapes).

Sinon :
- pas de rôle → redirection propre vers l'accueil ;
- rôle mais pas de 2FA → écran « 2FA obligatoire » qui renvoie vers `/kont`.

## 1. Attribuer un rôle

### Option A — script (recommandé)
```bash
node scripts/set-admin-role.mjs <email> <role>
# ex.
node scripts/set-admin-role.mjs toi@example.com super-admin
# révoquer :
node scripts/set-admin-role.mjs toi@example.com none
```
Le script lit `CLERK_SECRET_KEY` depuis `.env.local`.

### Option B — Clerk Dashboard
Users → (l'utilisateur) → **Metadata** → **Public metadata** :
```json
{ "role": "super-admin" }
```

## 2. Activer la 2FA (obligatoire)

Connecte-toi, va sur **`/kont`** → onglet **Sécurité** → active une méthode
(application TOTP, SMS, ou passkey). Tant que la 2FA n'est pas active, `/admin`
affiche l'écran de blocage.

## 3. (Optionnel) Fast-path du middleware

Le **layout** admin fait la vérification de rôle **faisant autorité** via l'API
Backend de Clerk (fonctionne sans config supplémentaire). Pour rejeter aussi les
non-admins **dès le middleware** (avant d'atteindre le serveur), ajoute un
**custom session token claim** dans le Clerk Dashboard :

Sessions → **Customize session token** :
```json
{ "metadata": "{{user.public_metadata}}" }
```
Le middleware lit alors `sessionClaims.metadata.role`. Si ce claim n'est pas
configuré, rien ne casse — le layout reste la barrière qui fait autorité.

## 4. Source de données

Le code lit `process.env.ADMIN_DATA_SOURCE` :

- **non défini / `mock`** → dataset mock en mémoire (défaut actuel). Rien à faire.
- `real` → implémentation Drizzle (pas encore écrite ; lève une erreur volontaire
  tant qu'elle n'existe pas).

Tout passe par un **point de bascule unique** : `lib/admin/data/index.ts`.
Les composants d'UI n'importent jamais le mock directement — ils appellent
`getKpiOverview()` (et, plus tard, les autres getters) depuis ce module. Quand le
backend réel sera prêt, on implémente `realDataSource()` et on bascule l'env, sans
toucher à l'UI.

## Fichiers clés

| Rôle | Fichier |
|---|---|
| Contrat de données (types par domaine) | `lib/admin/data/types.ts` |
| Dataset mock déterministe | `lib/admin/data/mock/dataset.ts` |
| Calcul des KPIs (mock) | `lib/admin/data/mock/index.ts` |
| Point de bascule mock/réel | `lib/admin/data/index.ts` |
| Rôles + garde de type | `lib/admin/roles.ts` |
| Protection middleware | `middleware.ts` |
| Garde serveur (rôle + 2FA) | `app/[locale]/admin/layout.tsx` |
| Coquille (sidebar + header) | `components/admin/AdminShell.tsx` |
| Vue d'ensemble (KPIs) | `app/[locale]/admin/page.tsx` |
| Écran 2FA obligatoire | `components/admin/Require2FA.tsx` |
