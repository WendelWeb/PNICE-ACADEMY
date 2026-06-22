Réalité préalable (à acter avant de coder l'admin)
Un admin avec de vraies stats a besoin de choses qui n'existent pas encore (on est en mock) :

Base de données réelle (Neon + Drizzle) : tables users, enrollments, payments, subscriptions, progress, certificates.
Paiements réels branchés (Stripe/PayPal/MonCash/NatCash/crypto) + webhooks qui remplissent payments/subscriptions.
Clerk en rôle admin (accès réservé) — dépend de Clerk résolu.
Table subscriptions dédiée (l'ancien schéma ne gère pas le récurrent) + table events (vues, visionnages) pour l'engagement + tables coupons, refunds, audit_log.
→ Donc soit on construit le backend d'abord, soit on fait l'admin en UI avec données mock puis on branche le réel. (Décision à prendre.)

1. Vue d'ensemble (cartes KPI en haut)
   Total utilisateurs inscrits
   Abonnés actifs + MRR (revenu récurrent mensuel)
   Revenu total (à vie) + ce mois-ci
   Nouveaux inscrits aujourd'hui / 7j / 30j
   Nouvelles inscriptions à un cours aujourd'hui / 7j / 30j
   Taux de conversion (visiteur → compte → payant)
   Apprenants actifs (ont regardé une leçon < 7/30j)
   Taux de churn (abonnements annulés)
   ARPU (revenu moyen par utilisateur) + LTV (valeur vie client)
   Remboursements (nombre + montant)
2. Graphiques / analytics
   Revenu dans le temps (jour/semaine/mois) — séparé abonnement vs à l'unité
   Inscriptions (signups) dans le temps
   Inscriptions aux cours dans le temps
   Revenu par méthode de paiement (camembert : PayPal, Visa/MC, MonCash, NatCash, Crypto)
   Revenu par cours (lesquels vendent le plus)
   Croissance des abonnements + rétention par cohorte
   Répartition géo (Haïti vs diaspora, par pays)
   Répartition langue (ht vs fr)
   Tunnel de conversion : visite → compte → cours commencé → complété → certificat
   Heures de pointe de visionnage
3. Utilisateurs / inscrits
   Liste users (recherche, tri, pagination) : nom, email, téléphone, pays, langue, date inscription, nb de cours, statut abonnement, total dépensé, dernière activité, dernier paiement
   Segments par nb de cours : 1, 2, 3, 4, 5+ (exactement ce que tu demandes) ✅
   Segments : abonnés / acheteurs à l'unité / inscrits gratuits (jamais payé)
   Fiche user détaillée : profil, cours inscrits, historique paiements, progression par cours, certificats, journal d'activité
   Actions manuelles : donner/retirer accès à un cours, offrir un abonnement, rembourser, suspendre/bannir, renvoyer la vérification, « se connecter en tant que » (impersonation) pour le support
   Export CSV des users
   Users inactifs (inscrits mais jamais acheté / jamais regardé)
   Top dépensiers
4. Cours / contenu (CMS)
   Liste cours avec stats : inscriptions, revenu, taux de complétion, nb leçons, publié/brouillon
   Créer/éditer un cours (titres ht/fr, accroche, points, prix, icône, images, publication)
   Gérer les leçons : ajouter/éditer/réordonner, ID vidéo Bunny, durée, aperçu on/off
   Analytics par cours : inscriptions, drop-off par leçon (où les élèves abandonnent), temps de visionnage moyen
   Éditer le contenu page de vente (promesse, problème, livrables, prérequis, FAQ)
   Gérer les images / diaporama d'un cours (upload, réordonner)
   Gestion des prix (changer, voir l'impact)
5. Abonnements
   Liste des abonnements actifs + date de renouvellement + contribution MRR
   Événements : nouveau, renouvelé, annulé, paiement échoué (relance/dunning)
   Paiements en échec / abonnements en retard (à relancer)
   Raisons d'annulation (si collectées)
   Renouvellements à venir (7/30j) + revenu attendu
6. Paiements / revenus
   Liste des transactions : user, montant USD + HTG, méthode, réf provider, statut (pending/completed/failed/refunded), date, produit
   Filtres par méthode, statut, période
   Dernier paiement (par user et global) ✅
   Transactions échouées/en attente à investiguer
   Gestion des remboursements
   Réconciliation par provider (ce que chaque provider a réglé)
   Gestion du taux USD→HTG (le régler pour tout le site depuis l'admin) — important vu le contexte
   Frais par provider (combien chaque provider mange sur la marge)
   Reçus / factures générés
7. Progression / engagement
   Taux de complétion par cours
   Certificats émis (liste, réémettre, révoquer)
   Leçon où on perd les élèves (drop-off)
   Temps moyen pour finir un cours
   Leçons les plus / moins regardées
8. Témoignages / preuve sociale
   Gérer les témoignages (approuver, publier, marquer réel vs exemple) — lié à l'obligation « remplacer les placeholders avant lancement »
   Demander un témoignage aux élèves qui ont fini
   Compteur de places (« plas ki rete ») — régler la vraie valeur
9. Marketing / acquisition
   Codes promo / coupons (créer, suivre l'usage, réduction)
   Parrainage (referral) si programme
   Attribution de la source (UTM : d'où viennent les inscrits)
   Annonces / emails aux utilisateurs
   Paniers abandonnés (checkout commencé, pas payé) — à relancer
10. Support / opérations
    Boîte de support / messages de contact
    Journal d'audit (quel admin a fait quoi)
    Santé système : échecs de webhooks paiement, statut uploads Bunny, logs d'erreur
    Notifications admin (nouvelle vente, paiement échoué, demande de remboursement)
11. Rôles / sécurité admin
    Rôles (super-admin, admin, support, éditeur de contenu) via Clerk metadata
    Gérer les admins (inviter, attribuer un rôle)
    2FA obligatoire pour les admins
    Accès admin protégé (/admin réservé aux rôles admin)
12. Paramètres / config
    Réglages plateforme : prix abonnement, taux de change, providers de paiement on/off, mode maintenance
    Gérer les textes ht/fr
    Pages légales (CGU, confidentialité, remboursement)
    Reco de construction (par phases, vu l'ampleur)
    Phase A (essentiel) : /admin protégé + KPIs + liste users (avec segments 1-5+ cours) + transactions + dernier paiement + stats par cours.
    Phase B : graphiques (revenu/signups/méthodes), abonnements, remboursements, taux de change.
    Phase C : CMS cours/leçons/images, témoignages, certificats.
    Phase D : marketing (coupons, sources, paniers abandonnés), support, audit, santé système.
    Côté technique je proposerai une lib de graphiques légère (server-rendered ou Recharts en lazy) pour ne pas plomber le bundle (contexte Haïti).

Donc, avant le feu vert, deux décisions de ta part :

Admin maintenant en données mock, puis on branche le réel quand le backend (DB + paiements) arrive — ou on fait le backend d'abord ?
On confirme que Clerk est résolu (tu ajoutes les clés + on teste la connexion) avant de commencer l'admin, comme tu l'as dit.
Dis-moi ce que tu ajustes/ajoutes à cette liste, et donne le feu vert quand tu veux. 🚦
