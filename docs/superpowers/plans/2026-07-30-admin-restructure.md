# Restructuration de l'admin (IA + UX éditeur) — Plan

> Execute with subagent-driven-development. Owner ask (2026-07-30): "je devrais
> avoir deux espaces admin — un pour gérer la plateforme, un pour gérer les
> cours ; tout est mélangé. L'UI/UX de l'upload et de la modification de cours
> est terrible et pas intuitive. Supprime/déplace ce qu'il faut, ajoute ce qui
> manque."

## Diagnostic (état actuel, vérifié)
1. **Nav plate de 20 items** — aucun regroupement ; « Taux de change » côtoie
   « Utilisateurs ». Impossible de savoir ce qui relève du pilotage de la
   plateforme vs du travail quotidien sur les cours.
2. **3 pages de réglages qui se chevauchent**, découpées arbitrairement :
   - `/admin/parametres` : DigestPanel, LegalEditor, PlacesConfig,
     ReferralCreditPanel, TextsEditor  → mélange **contenu du site** et **réglages business**
   - `/admin/plateforme` : MaintenancePanel, ProvidersPanel, SubscriptionPricePanel
   - `/admin/taux` : FX
   (prix abonnement ici, crédit parrainage là ; textes du site traités comme un réglage)
3. **Éditeur de cours = un mur** : CourseEditor + ImagesManager + LessonsManager
   (539 lignes) + CourseReadiness + PublishBar empilés sur une page. La leçon
   affiche tout en même temps (titres, desc, notes, ressources, upload, durée,
   preview) → illisible dès 5 leçons.

## Cible

### A) Navigation groupée en SECTIONS (le « deux espaces » demandé)
Le sidebar devient sectionné (titres de groupe, non cliquables) :

- **Pilotage** — Vue d'ensemble · Analytics
- **Cours & contenu** — Formations · Engagement · Certificats · Témoignages · **Contenu du site** (nouveau)
- **Enseignants** — Enseignants · Retraits
- **Personnes** — Utilisateurs · Support
- **Argent** — Transactions · Abonnements · Marketing
- **Plateforme** (owner) — Réglages · Taux de change · Rôles · Audit · Santé

Les capacités existantes restent la source de vérité (un rôle qui n'a aucune
entrée dans un groupe ne voit pas le titre du groupe).

### B) Consolidation des réglages (supprimer/déplacer)
- **NOUVEAU `/admin/contenu`** (cap `courses.edit`) : TextsEditor + LegalEditor +
  PlacesConfig — c'est du **contenu du site**, pas un réglage.
- **`/admin/plateforme`** devient LA page de réglages plateforme : Providers +
  Maintenance + Prix abonnement + **ReferralCreditPanel** + **DigestPanel**
  (déplacés depuis /parametres).
- **`/admin/parametres` SUPPRIMÉE** → redirection permanente vers `/admin/plateforme`
  (ne jamais casser un lien/bookmark existant).
- `/admin/taux` reste dédiée (demande explicite du owner).

### C) Éditeur de cours : onglets + leçons repliables
- `/admin/cours/[slug]/editer` (et le studio prof) passent en **onglets** :
  **Infos** (titres/desc/prix/catégorie/niveau) · **Plan** (chapitres+leçons) ·
  **Médias** (images) · **Ressources** (liens du cours).
  Onglet via `?tab=` (URL partageable, pas d'état perdu).
- **Barre sticky** en bas/haut : statut + checklist de complétude (compteur) +
  bouton Publier/Soumettre — toujours visible, plus besoin de scroller.
- **Ligne de leçon repliée par défaut** : `N · Titre · durée · ✓/✗ vidéo · aperçu`
  + bouton déplier. Dépliée : les champs, groupés en sous-blocs (Titres,
  Description, **Vidéo**, Notes, Ressources).
- **Vidéo = zone d'upload évidente** (voir D), plus un champ texte cramé au milieu.

### D) UX d'upload (le point le plus critiqué)
- **Zone drag & drop** ("Glisse ta vidéo ici ou clique pour choisir"), grande,
  on-brand (kraft/ochre), avec l'état vide explicite.
- États clairs : *vide* → *envoi X %* (barre + annuler) → *✓ vidéo prête* (avec
  le nom du fichier + un bouton « Remplacer »).
- Le champ « ID Bunny » manuel devient **secondaire** (repliable « avancé »),
  puisque l'upload est automatique.
- Messages d'erreur explicites (fichier trop lourd, format, Bunny non configuré).

## Tâches
**A1 — Nav sectionnée + consolidation des réglages.**
nav.ts devient une liste de groupes (`{ section, items[] }`) ; AdminShell rend les
titres de groupe (masqués si aucun item visible pour le rôle). Créer `/admin/contenu`
(déplacer TextsEditor/LegalEditor/PlacesConfig), déplacer ReferralCreditPanel +
DigestPanel dans `/admin/plateforme`, supprimer `/admin/parametres` + redirection.
i18n des nouveaux libellés (groupes + page contenu) ht/fr. Aucune capacité
modifiée. Accept: chaque page atteignable, aucune régression de droits, redirection OK.

**A2 — Éditeur de cours en onglets + leçons repliables + upload drag & drop.**
Découper `editer/page.tsx` en onglets (`?tab=`), extraire `LessonsManager` (539 l.)
en sous-composants (`ChapterGroup`, `LessonRow`, `LessonEditPanel`), replier les
leçons par défaut, barre sticky (statut+readiness+publier), et refondre
`VideoUpload` en zone drag & drop avec états + « Remplacer ». Les DEUX call sites
(admin CMS + studio prof) gardent leurs actions gatées. Accept: éditer un cours de
10 leçons reste lisible ; upload évident ; aucune action perdue.

## Contraintes
Aucune capacité/permission modifiée ; money path intact ; bilingue ht/fr
(check:i18n) ; rétro-compatible (cours sans chapitres inchangés) ; pas de dep ;
focus-visible, 360px, reduced-motion ; design PART A de docs/superpowers/plans/2026-07-22-ui-refonte.md.
