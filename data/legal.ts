/**
 * data/legal.ts — the code-shipped DEFAULT content of the three public legal
 * pages (/legal/cgu, /legal/confidentialite, /legal/remboursement), in both
 * languages, written for THIS platform: a multi-teacher course marketplace
 * (independent teachers moderated by PNICE Academy, 70/30 revenue split),
 * paid TODAY through the two Haitian mobile wallets — MonCash (via Bazik)
 * and NatCash (via Kobara), charged in gourdes at the exact amount shown on
 * the checkout page — with USD as the reference price and card payment
 * (USD, via Stripe) announced as coming; three products (course à l'unité,
 * per-teacher "Pass Prof" subscription, all-access "Pass PNICE"
 * subscription — the passes open with card payment), completion
 * certificates, videos streamed via a CDN, Google sign-in, and support via
 * tickets. Wallet refunds are MANUAL (no MonCash/NatCash refund API):
 * money goes back to the SAME wallet number that paid — the policy says so.
 *
 * RENDER ORDER (lib/admin/site/store.ts's getLegal): DB content saved from
 * /admin/contenu wins when non-empty, PER LANGUAGE; a blank language falls
 * back to the text below. So these defaults are what visitors read until the
 * owner writes (or pastes an amended copy of) their own version.
 *
 * INTERNAL NOTE — NOT user-visible: these policies were drafted in-code so
 * the site never ships payment pages next to an empty legal page. They state
 * the platform's real, current practices (refund window: 7 days on courses
 * if under 20% consumed; subscriptions cancellable anytime, effective at the
 * end of the paid period). Owner + qualified legal review before public
 * launch is strongly advised; edits persist from /admin/contenu.
 */

export type LegalSlug = 'cgu' | 'confidentialite' | 'remboursement';

/** Shown as "last updated" on a page that still renders the code default. */
export const LEGAL_DEFAULTS_UPDATED_AT = '2026-08-14T00:00:00.000Z';

const CGU_HT = `1. Kiyès nou ye
PNICE Academy se yon makètplas fòmasyon an liy ki fèt pou moun ki pale kreyòl ak franse, ann Ayiti ak nan dyaspora a. Sou platfòm nan, pwofesè endepandan kreye kou; ekip PNICE Academy revize chak kou anvan li parèt piblik. Lè w kreye yon kont oswa lè w achte yon kou, ou dakò ak kondisyon sa yo.

2. Kont ou
Ou konekte ak kont Google ou. Kont lan se pou ou sèlman: pa pataje aksè w ak lòt moun. Ou responsab tout sa ki fèt ak kont ou. Si w wè yon aktivite ki pa nòmal, kontakte sipò a san pèdi tan.

3. Sa nou vann
Gen twa fason pou w aprann sou PNICE Academy:
• Kou a linite: ou peye yon sèl fwa pou yon kou, epi ou jwenn aksè ak kou sa a san limit tan, toutotan kou a rete sou platfòm nan.
• Pass Prof: yon abònman chak mwa ki ba w aksè ak TOUT kou yon sèl pwofesè. Se pwofesè a ki fikse pri pa li.
• Pass PNICE: yon abònman chak mwa ki ba w aksè ak TOUT kou ki sou platfòm nan. Se PNICE Academy ki fikse pri sa a.
Kou a linite yo disponib kounye a. Pass yo (abònman) ap louvri lè peman ak kat la rive, byento.

4. Pri ak peman
Pri chak kou afiche an dola ameriken (USD): se pri referans lan. Jodi a, ou peye ak MonCash oswa NatCash, an goud (HTG). Anvan ou konfime, paj peman an montre w montan egzak la an goud k ap soti sou kont ou — se montan sa a menm ki debite. Konvèsyon USD→HTG a fèt ak yon to nou mete ajou regilyèman.
Peman yo pase nan patnè ofisyèl nou yo: Bazik pou MonCash, Kobara pou NatCash. Ou konfime peman an ak kòd sekrè w sou pwòp telefòn ou — nou pa janm wè ni kenbe kòd sekrè MonCash oswa NatCash ou.
Peman ak kat Visa/Mastercard (an USD, atravè patnè nou an Stripe) ap vini byento. Lè sa a tou, nou p ap janm wè ni kenbe nimewo kat ou.

5. Aksè ou apre acha
Aksè ak yon kou ouvri kou peman an konfime. Yon kou achte a linite rete pou ou. Yon abònman (Pass Prof oswa Pass PNICE) rete aktif toutotan ou peye chak mwa; si w kanpe li, ou kenbe aksè a jouk dat peryòd ou te peye a fini.

6. Ranbousman
Gen yon règ klè: pou yon kou achte a linite, ou ka mande ranbousman nan 7 jou apre acha a, si ou poko gade plis pase 20% nan kou a. Yon abònman ka kanpe nenpòt kilè; li fini nan bout peryòd ou te deja peye a, san ranbousman pou jou ki pase yo. Tout detay yo nan Politik Ranbousman an (/legal/remboursement).

7. Pwofesè yo
Pwofesè yo se pwofesyonèl endepandan; yo pa anplwaye PNICE Academy. Chak kou pase nan yon revizyon anvan li pibliye, men se pwofesè a ki responsab kontni li. Sou chak vant, pwofesè a resevwa 70% epi platfòm nan kenbe 30% kòm komisyon pou sèvis li yo (peman, videyo, sipò, pwomosyon).

8. Sètifika
Lè w fini yon kou nèt, ou resevwa yon sètifika ak yon kòd verifikasyon. Nenpòt moun ka tcheke si yon sètifika valab sou paj verifikasyon nou an. Sètifika nou yo montre ou fini yon fòmasyon sou PNICE Academy; yo pa yon diplòm ofisyèl Leta.

9. Videyo ak kontni
Videyo yo difize sou entènèt atravè yon rezo distribisyon (CDN) pou yo mache byen menm ak yon koneksyon fèb. Aksè a se pou ou sèlman: ou pa gen dwa telechaje, kopye, revann, ni pataje kontni yo. Tout kontni rete pwopriyete pwofesè yo ak PNICE Academy.

10. Sa ki entèdi
Ou pa gen dwa: pataje kont ou, pibliye kontni yon kou yon lòt kote, eseye kase sekirite platfòm nan, ni itilize sit la pou fwod oswa aktivite ilegal. Si sa rive, nou ka fèmen kont ou; nan ka fwod, san ranbousman.

11. Sipò
Pou nenpòt kesyon oswa pwoblèm, louvri yon tikè sipò nan kont ou (Kont → Sipò) oswa ekri nou: kontak@pniceacademy.com. Nou reponn pi vit posib, an kreyòl oswa an franse.

12. Chanjman
Nou ka mete kondisyon sa yo ajou. Dat dènye chanjman an parèt anwo paj la. Si gen yon gwo chanjman, n ap fè w konnen sou sit la oswa pa imèl. Si w kontinye itilize platfòm nan apre yon chanjman, sa vle di ou aksepte l.

13. Kontak
PNICE Academy — kontak@pniceacademy.com`;

const CGU_FR = `1. Qui sommes-nous
PNICE Academy est une marketplace de formations en ligne pensée pour les personnes qui parlent créole et français, en Haïti comme dans la diaspora. Sur la plateforme, des professeurs indépendants créent des cours ; l'équipe PNICE Academy relit chaque cours avant sa publication. En créant un compte ou en achetant un cours, tu acceptes les présentes conditions.

2. Ton compte
Tu te connectes avec ton compte Google. Ton compte est strictement personnel : ne partage pas ton accès. Tu es responsable de tout ce qui se fait avec ton compte. Si tu remarques une activité anormale, contacte le support sans attendre.

3. Ce que nous vendons
Il y a trois façons d'apprendre sur PNICE Academy :
• Le cours à l'unité : tu paies une seule fois et tu gardes l'accès à ce cours sans limite de durée, tant qu'il reste sur la plateforme.
• Le Pass Prof : un abonnement mensuel qui donne accès à TOUS les cours d'un même professeur. C'est le professeur qui fixe son prix.
• Le Pass PNICE : un abonnement mensuel qui donne accès à TOUS les cours de la plateforme. C'est PNICE Academy qui fixe ce prix.
Les cours à l'unité sont disponibles dès maintenant. Les Pass (abonnements) ouvriront avec l'arrivée du paiement par carte, bientôt.

4. Prix et paiement
Le prix de chaque cours est affiché en dollars américains (USD) : c'est le prix de référence. Aujourd'hui, tu paies avec MonCash ou NatCash, en gourdes (HTG). Avant de confirmer, la page de paiement affiche le montant exact en gourdes qui sera prélevé sur ton compte — c'est ce montant-là qui est débité. La conversion USD→HTG se fait à un taux que nous mettons à jour régulièrement.
Les paiements passent par nos partenaires officiels : Bazik pour MonCash, Kobara pour NatCash. Tu confirmes le paiement avec ton code secret sur ton propre téléphone — nous ne voyons ni ne conservons jamais ton code secret MonCash ou NatCash.
Le paiement par carte Visa/Mastercard (en USD, via notre partenaire Stripe) arrive bientôt. Là aussi, nous ne verrons ni ne conserverons jamais ton numéro de carte.

5. Ton accès après achat
L'accès à un cours s'ouvre dès la confirmation du paiement. Un cours acheté à l'unité t'appartient. Un abonnement (Pass Prof ou Pass PNICE) reste actif tant que tu paies chaque mois ; si tu l'arrêtes, tu conserves l'accès jusqu'à la fin de la période déjà payée.

6. Remboursement
La règle est simple : pour un cours acheté à l'unité, tu peux demander un remboursement dans les 7 jours suivant l'achat, si tu as consulté moins de 20% du cours. Un abonnement peut être annulé à tout moment ; il prend fin au terme de la période déjà payée, sans remboursement au prorata. Tous les détails sont dans la Politique de remboursement (/legal/remboursement).

7. Les professeurs
Les professeurs sont des professionnels indépendants ; ils ne sont pas salariés de PNICE Academy. Chaque cours passe une revue avant publication, mais chaque professeur reste responsable de son contenu. Sur chaque vente, le professeur reçoit 70% et la plateforme conserve 30% de commission pour ses services (paiement, vidéo, support, promotion).

8. Certificats
Quand tu termines entièrement un cours, tu reçois un certificat avec un code de vérification. N'importe qui peut vérifier la validité d'un certificat sur notre page de vérification. Nos certificats attestent que tu as terminé une formation sur PNICE Academy ; ce ne sont pas des diplômes d'État.

9. Vidéos et contenus
Les vidéos sont diffusées en streaming via un réseau de distribution (CDN) pour bien fonctionner même avec une connexion faible. Ton accès est personnel : tu n'as pas le droit de télécharger, copier, revendre ni partager les contenus. Les contenus restent la propriété des professeurs et de PNICE Academy.

10. Ce qui est interdit
Il est interdit de : partager ton compte, publier le contenu d'un cours ailleurs, tenter de contourner la sécurité de la plateforme, ou utiliser le site pour une fraude ou une activité illégale. En cas d'abus, nous pouvons fermer ton compte ; en cas de fraude, sans remboursement.

11. Support
Pour toute question ou tout problème, ouvre un ticket de support depuis ton compte (Compte → Support) ou écris-nous : kontak@pniceacademy.com. Nous répondons au plus vite, en créole ou en français.

12. Modifications
Nous pouvons mettre à jour ces conditions. La date de dernière modification figure en haut de la page. En cas de changement important, nous te préviendrons sur le site ou par e-mail. Continuer à utiliser la plateforme après un changement vaut acceptation.

13. Contact
PNICE Academy — kontak@pniceacademy.com`;

const CONF_HT = `1. Sa dokiman sa a ye
Politik sa a esplike ki enfòmasyon PNICE Academy kolekte sou ou, poukisa, ak ki dwa ou genyen. Nou kolekte sèlman sa nou bezwen pou platfòm nan mache.

2. Enfòmasyon nou kolekte
• Kont ou: non ou, adrès imèl ou, ak foto pwofil ou, ki soti nan kont Google ou lè w konekte (atravè sèvis koneksyon nou an, Clerk).
• Pwogrè ou: ki leson ou gade, ki kou ou fini, sètifika ou resevwa yo.
• Acha ou yo: ki kou oswa abònman ou peye, dat ak montan yo (an USD ak an goud). Pou MonCash ak NatCash, se patnè peman nou yo (Bazik, Kobara) ki trete peman an; nou pa janm wè ni kenbe kòd sekrè w. Lè peman ak kat la ap disponib, se Stripe k ap trete kat ou; nou p ap janm wè nimewo kat ou.
• Mesaj sipò ou yo: sa w ekri nan tikè sipò yo, pou nou ka reponn ou.
• Chwa cookies ou: sa w aksepte nan ti fenèt cookies la (esansyèl, estatistik, maketing).

3. Poukisa nou itilize yo
Pou louvri aksè ak kou ou achte yo, swiv pwogrè ou, bay sètifika, reponn kesyon ou yo, voye imèl enpòtan sou kont ou (resi, konfimasyon), epi amelyore platfòm nan. Nou pa vann done pèsonèl ou bay pèsonn.

4. Patnè teknik nou yo
Pou platfòm nan fonksyone, nou sèvi ak kèk patnè serye ki trete done nan non nou:
• Clerk — koneksyon ak sekirite kont (Google).
• Bazik — trete peman MonCash yo.
• Kobara — trete peman NatCash yo.
• Stripe — peman ak kat (byento); se yo k ap kenbe enfòmasyon kat ou, dapre estanda sekirite bankè yo.
• Bunny — difizyon videyo yo ak estokaj fichye kou yo.
• Resend — imèl nou voye ba ou (resi, sipò, nouvèl kont ou).
• Yon baz done ki byen pwoteje kote nou kenbe kont ou ak pwogrè ou.
Chak patnè resevwa sèlman sa li bezwen pou wòl pa li.

5. Cookies
Cookies esansyèl yo nesesè pou sit la mache (pa egzanp, pou w rete konekte). Cookies estatistik ak maketing yo mache sèlman si ou aksepte yo; ou ka chanje chwa ou nenpòt kilè.

6. Konbyen tan nou kenbe done ou
Nou kenbe done kont ou toutotan kont lan aktif. Resi ak dosye peman yo rete pi lontan paske lalwa ak kontabilite mande sa. Si w efase kont ou, nou efase enfòmasyon pèsonèl ou (non, imèl, telefòn, vil); liy kontablite acha yo rete, men san non w sou yo — se sa lalwa mande, epi se sa ki pèmèt yon ranbousman toujou posib.

7. Dwa ou yo
Ou gen dwa: wè done nou gen sou ou, korije yo, oswa mande efase kont ou. Pou sa, louvri yon tikè sipò oswa ekri kontak@pniceacademy.com. N ap reponn ou pi vit posib.

8. Sekirite
Koneksyon ou ak sit la chifre (HTTPS). Aksè ak done yo limite: sèlman moun ki bezwen yo pou fè travay yo ka wè yo, epi aksyon admin yo anrejistre.

9. Chanjman
Si politik sa a chanje, dat la ap mete ajou anwo paj la, epi n ap fè w konnen si chanjman an enpòtan.

10. Kontak
Pou nenpòt kesyon sou done ou: kontak@pniceacademy.com`;

const CONF_FR = `1. À quoi sert ce document
Cette politique explique quelles informations PNICE Academy collecte à ton sujet, pourquoi, et quels sont tes droits. Nous ne collectons que ce qui est nécessaire au fonctionnement de la plateforme.

2. Les informations que nous collectons
• Ton compte : ton nom, ton adresse e-mail et ta photo de profil, transmis par ton compte Google quand tu te connectes (via notre service de connexion, Clerk).
• Ta progression : les leçons consultées, les cours terminés, les certificats obtenus.
• Tes achats : les cours ou abonnements payés, avec date et montant (en USD et en gourdes). Pour MonCash et NatCash, ce sont nos partenaires de paiement (Bazik, Kobara) qui traitent le paiement ; nous ne voyons ni ne conservons jamais ton code secret. Quand le paiement par carte sera disponible, c'est Stripe qui traitera ta carte ; nous ne verrons jamais ton numéro de carte.
• Tes messages de support : ce que tu écris dans les tickets, pour pouvoir te répondre.
• Tes choix de cookies : ce que tu acceptes dans la bannière (essentiels, statistiques, marketing).

3. Pourquoi nous les utilisons
Pour ouvrir l'accès aux cours achetés, suivre ta progression, délivrer les certificats, répondre à tes questions, t'envoyer les e-mails importants liés à ton compte (reçus, confirmations) et améliorer la plateforme. Nous ne vendons tes données personnelles à personne.

4. Nos partenaires techniques
Pour faire fonctionner la plateforme, nous nous appuyons sur des partenaires sérieux qui traitent des données pour notre compte :
• Clerk — connexion et sécurité du compte (Google).
• Bazik — traitement des paiements MonCash.
• Kobara — traitement des paiements NatCash.
• Stripe — paiement par carte (bientôt) ; c'est lui qui conservera les informations de ta carte, selon les standards de sécurité bancaires.
• Bunny — diffusion des vidéos et stockage des fichiers de cours.
• Resend — les e-mails que nous t'envoyons (reçus, support, vie du compte).
• Une base de données sécurisée où sont conservés ton compte et ta progression.
Chaque partenaire ne reçoit que ce dont il a besoin pour son rôle.

5. Cookies
Les cookies essentiels sont nécessaires au fonctionnement du site (par exemple pour rester connecté·e). Les cookies statistiques et marketing ne s'activent que si tu les acceptes ; tu peux changer ton choix à tout moment.

6. Durée de conservation
Nous conservons les données de ton compte tant qu'il est actif. Les reçus et pièces de paiement sont conservés plus longtemps, pour des raisons légales et comptables. Si tu supprimes ton compte, nous effaçons tes informations personnelles (nom, e-mail, téléphone, ville) ; les lignes comptables de tes achats sont conservées, mais sans ton nom — la loi l'exige, et c'est ce qui permet qu'un remboursement reste possible.

7. Tes droits
Tu as le droit de : consulter les données que nous détenons sur toi, les corriger, ou demander la suppression de ton compte. Pour cela, ouvre un ticket de support ou écris à kontak@pniceacademy.com. Nous te répondrons au plus vite.

8. Sécurité
Ta connexion au site est chiffrée (HTTPS). L'accès aux données est limité aux personnes qui en ont besoin pour leur travail, et les actions des administrateurs sont journalisées.

9. Modifications
Si cette politique évolue, la date sera mise à jour en haut de la page, et nous te préviendrons si le changement est important.

10. Contact
Pour toute question sur tes données : kontak@pniceacademy.com`;

const REMB_HT = `1. Prensip nou
Nou vle w achte ak konfyans. Règ yo senp, epi yo klè menm jan an kreyòl ak an franse.

2. Kou achte a linite — 7 jou
Ou ka mande ranbousman KONPLÈ yon kou ou achte a linite si DE kondisyon sa yo ranpli:
• ou fè demann lan nan 7 jou apre dat acha a, epi
• ou poko gade plis pase 20% nan kou a.
Pase 7 jou, oswa si w gade plis pase 20% nan kou a, acha a pa ranbousab ankò.

3. Abònman (Pass Prof ak Pass PNICE)
Ou ka kanpe yon abònman nenpòt kilè, depi nan kont ou. Lè w kanpe li:
• ou kenbe aksè a jouk dènye jou peryòd ou te deja peye a;
• apre dat sa a, abònman an pa renouvle epi ou pa peye anyen ankò;
• mwa ki deja peye a pa ranbousab, ni an antye ni an pati.
Si nou ta debite w de fwa pou menm peryòd la pa erè, n ap ranbouse w san diskisyon.
(Pass yo ap disponib lè peman ak kat la louvri, byento; règ sa yo ap aplike depi lè sa a.)

4. Kijan pou w fè demann lan
Louvri yon tikè sipò nan kont ou (Kont → Sipò) oswa ekri kontak@pniceacademy.com, ak imèl kont ou ak non kou a. Ou pa bezwen esplike anpil — men si w di nou sa k pa mache, sa ede nou amelyore.

5. Kijan nou remèt lajan an
Nou remèt lajan an menm kote li te soti a:
• Peman MonCash oswa NatCash: nou voye montan egzak ou te peye a an goud, tounen sou MENM nimewo MonCash oswa NatCash ou te sèvi pou peye a. Ranbousman sa a fèt manyèlman pa ekip nou an — konte jiska 7 jou ouvrab apre nou apwouve demann lan.
• Peman ak kat (lè li disponib): ranbousman an ap pase sou menm kat ou te peye a, an USD; bank ou ka pran 5 a 10 jou ouvrab anplis pou montre lajan an.
Nou pa ka voye yon ranbousman sou yon lòt nimewo, yon lòt kat, oswa yon lòt kont pase sa ou te sèvi pou peye a.

6. Ka espesyal
• Si yon pwoblèm teknik serye bò kote nou te anpeche w suiv kou a, ekri nou: n ap jwenn yon solisyon (repare, kredi, oswa ranbousman).
• Si yon kou ta retire sou platfòm nan pandan ou poko fini l, n ap kontakte w pou jwenn yon solisyon ki jis.
• Nan ka fwod oswa abi (pa egzanp, gade tout kou a epi mande ranbousman plizyè fwa), nou rezève dwa pou nou refize.

7. Kontak
Kesyon sou yon peman? kontak@pniceacademy.com — oswa yon tikè sipò nan kont ou.`;

const REMB_FR = `1. Notre principe
Nous voulons que tu achètes en confiance. Les règles sont simples, et identiques en créole et en français.

2. Cours acheté à l'unité — 7 jours
Tu peux demander le remboursement COMPLET d'un cours acheté à l'unité si ces DEUX conditions sont réunies :
• ta demande est faite dans les 7 jours suivant la date d'achat, et
• tu as consulté moins de 20% du cours.
Au-delà de 7 jours, ou si plus de 20% du cours a été consulté, l'achat n'est plus remboursable.

3. Abonnements (Pass Prof et Pass PNICE)
Tu peux annuler un abonnement à tout moment, depuis ton compte. Quand tu annules :
• tu gardes l'accès jusqu'au dernier jour de la période déjà payée ;
• après cette date, l'abonnement ne se renouvelle plus et tu n'es plus débité·e ;
• le mois déjà payé n'est pas remboursable, ni en totalité ni au prorata.
Si nous te débitons deux fois pour la même période par erreur, nous te remboursons sans discussion.
(Les Pass seront disponibles avec l'arrivée du paiement par carte, bientôt ; ces règles s'appliqueront dès ce moment-là.)

4. Comment faire ta demande
Ouvre un ticket de support depuis ton compte (Compte → Support) ou écris à kontak@pniceacademy.com, en indiquant l'e-mail de ton compte et le nom du cours. Pas besoin de longues justifications — mais nous dire ce qui n'a pas convenu nous aide à nous améliorer.

5. Comment nous te remboursons
Nous remboursons là où l'argent est parti :
• Paiement MonCash ou NatCash : nous renvoyons le montant exact que tu as payé, en gourdes, sur le MÊME numéro MonCash ou NatCash que tu as utilisé pour payer. Ce remboursement est traité manuellement par notre équipe — compte jusqu'à 7 jours ouvrés après l'approbation de ta demande.
• Paiement par carte (quand il sera disponible) : le remboursement repassera sur la carte utilisée pour le paiement, en USD ; ta banque pourra mettre 5 à 10 jours ouvrés supplémentaires à afficher le montant.
Nous ne pouvons pas rembourser vers un autre numéro, une autre carte ou un autre compte que celui qui a servi à payer.

6. Cas particuliers
• Si un problème technique sérieux de notre côté t'a empêché·e de suivre le cours, écris-nous : nous trouverons une solution (correction, avoir, ou remboursement).
• Si un cours venait à être retiré de la plateforme avant que tu l'aies terminé, nous te contacterons pour trouver une solution juste.
• En cas de fraude ou d'abus (par exemple consulter tout un cours puis demander des remboursements répétés), nous nous réservons le droit de refuser.

7. Contact
Une question sur un paiement ? kontak@pniceacademy.com — ou un ticket de support depuis ton compte.`;

/** The complete, code-shipped default for each legal page, both languages. */
export const LEGAL_DEFAULTS: Record<LegalSlug, { content_ht: string; content_fr: string }> = {
  cgu: { content_ht: CGU_HT, content_fr: CGU_FR },
  confidentialite: { content_ht: CONF_HT, content_fr: CONF_FR },
  remboursement: { content_ht: REMB_HT, content_fr: REMB_FR },
};
