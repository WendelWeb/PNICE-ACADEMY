# L'atelier du prof — refonte de l'expérience de création de cours

> Owner: "je veux une interface belle et simple, évidente, avec des icônes, des
> instructions… qu'un prof avec une expérience minimale en informatique puisse
> créer, modifier, publier ses cours. Une chef-d'œuvre."

## Le sujet (ancrage)
Un prof haïtien — patron de shipping, coiffeuse, expert MonCash — qui n'a pas
l'habitude des logiciels. L'outil ne doit pas ressembler à un logiciel : il doit
ressembler à **un document qu'il reconnaît et qu'il remplit**, où l'on voit à tout
moment ce qui est fait et ce qu'il reste à faire.

## L'idée directrice : le bordereau
La marque est un **manifeste de cargaison** — un document qui liste une cargaison
ligne par ligne et qu'on **tamponne** quand tout est en règle. Un cours est
exactement ça : un manifeste de savoir, chapitre par chapitre, tamponné à la
publication. On arrête de traiter l'éditeur comme un formulaire ; **l'éditeur EST
le bordereau du cours**.

## Le problème réel à résoudre (pas cosmétique)
L'éditeur actuel = 4 onglets de poids égal (Infos/Plan/Médias/Ressources). Un
débutant ne sait pas : (1) par où commencer, (2) ce qu'un champ attend, (3) s'il a
fini. Les onglets ne portent **aucune séquence** et la checklist est enfouie.

## Direction

**Couleurs** (aucune invention — tokens existants) : ink #10204A (structure),
paper #EDE6D6 (fond kraft), paper-light (surface), **ochre #D98E2B = à faire /
action**, **teal #1F6E66 = validé**, stampred #B23A2E (bloquant, rare).

**Type** : Big Shoulders (titres), Work Sans (corps), IBM Plex Mono (étiquettes,
codes, compteurs — la « voix données » du document).

**Layout — le bordereau à deux colonnes** :
```
┌─────────────────────────────────────────────────────────┐
│ PA-04 · Biznis shipping        [brouillon]    [Publier] │ ← en-tête collant
├──────────────┬──────────────────────────────────────────┤
│ BON DE       │  ① L'essentiel                           │
│ CONTRÔLE     │  ┌─────────────────────────────────┐     │
│              │  │ 🏷 Titre de la formation         │     │
│ ① Essentiel  │  │   Ce que l'élève voit en premier │     │
│  ✓ titre     │  │   [____________________________] │     │
│  ✗ prix   →  │  │   ex : « Biznis shipping… »      │     │
│ ② Le plan    │  └─────────────────────────────────┘     │
│  ✗ 1 leçon→  │                                          │
│ ③ Médias     │                                          │
│ ④ Ressources │                                          │
│ ─────────────│                                          │
│ 3 à compléter│                                          │
└──────────────┴──────────────────────────────────────────┘
```
Les 4 onglets deviennent **4 étapes numérotées** (une vraie séquence : on écrit
l'essentiel, puis on bâtit le plan, puis on habille, puis on enrichit). Le rail
« bon de contrôle » est **permanent** : chaque ligne non cochée est **cliquable et
saute exactement au champ à corriger**. C'est ça, « évident ».

**Signature (l'unique moment théâtral)** : le **sceau de publication**. Chaque
point du bon de contrôle se tamponne en teal quand il est rempli ; quand les 8
sont verts, le bouton devient un **sceau de cire ocre** qu'on presse — animation
`Stamp` déjà existante. Publier = tamponner son manifeste. Tout le reste reste
sobre (fondus de 12px, pas d'effets).

**Anatomie d'un champ** (le vrai correctif pour un débutant) — chaque champ a :
1. une **icône** reconnaissable, 2. un **libellé en langage courant**, 3. une
ligne **« à quoi ça sert »**, 4. un **exemple réel** (« ex : … »), 5. un **✓ teal**
dès qu'il est rempli.

**Vides = invitations** : « Poko gen leson. Ajoute premye leson w la → ».

## Tâches
**D1 — La structure (le bordereau).** En-tête collant (code, titre, statut,
action). Rail « bon de contrôle » permanent, items cliquables qui défilent
jusqu'au champ (ancres + `scrollIntoView`, focus posé sur le champ). Les onglets
deviennent 4 étapes numérotées avec leur intention en une ligne. Le compteur
« N à compléter ». Le bouton Publier/Soumettre devient le sceau quand tout est
vert (réutiliser `Stamp`). Zéro perte de fonction ; les deux points d'entrée
(studio + tout appelant restant) gardent leurs actions gatées.

**D2 — La main (le soin du détail).** Icône + libellé clair + ligne d'aide +
exemple sur **chaque** champ (cours ET leçon), via un composant `Field` partagé.
États vides en invitations. Dropzone vidéo plus grande et rassurante (formats
acceptés, poids, « ça peut prendre quelques minutes »). Éditeur de ressources
plus lisible (icône lien/fichier, exemple d'URL). Lignes de chapitre/leçon plus
lisibles au premier coup d'œil.

## Contraintes
Tokens et composants existants (Sceau, Stamp, Reveal) — aucune nouvelle dépendance.
Bilingue ht/fr (kreyòl d'abord), `check:i18n` vert. Aucune action serveur ni
capacité modifiée ; owner-scoping intact. 360px, focus-visible, reduced-motion.
Rétrocompatible : cours monolingues et bilingues, avec et sans chapitres.
