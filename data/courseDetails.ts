/**
 * Contenu long-format (page de vente) pour chaque formation, séparé du
 * catalogue (data/courses.ts) car c'est une préoccupation distincte.
 * Indexé par `code` (PA-0X). `lessonDetails` suit le même ordre/longueur que
 * `course.lessons`. Bilingue ht/fr. Contenu de départ — affinable.
 */

export type CourseFaq = {
  q_ht: string;
  q_fr: string;
  a_ht: string;
  a_fr: string;
};

export type LessonDetail = {
  minutes: number;
  desc_ht: string;
  desc_fr: string;
};

export type CourseDetail = {
  level_ht: string;
  level_fr: string;
  promise_ht: string;
  promise_fr: string;
  problem_ht: string;
  problem_fr: string;
  deliverables_ht: string[];
  deliverables_fr: string[];
  requirements_ht: string[];
  requirements_fr: string[];
  lessonDetails: LessonDetail[];
  faq: CourseFaq[];
};

export const courseDetails: Record<string, CourseDetail> = {
  'PA-01': {
    level_ht: 'Debitan',
    level_fr: 'Débutant',
    promise_ht:
      "Nan fen fòmasyon an, w ap gen yon kat ki mache toupatou sou entènèt — menm san kont labank ameriken.",
    promise_fr:
      "À la fin, tu auras une carte qui marche partout en ligne — même sans compte bancaire américain.",
    problem_ht:
      "Ou wè bagay ou vle achte sou entènèt, men chak fwa ou rive nan peman an, kat ou refize. Lajan an la, men sistèm nan fèmen pòt la sou ou.",
    problem_fr:
      "Tu vois ce que tu veux acheter en ligne, mais à chaque paiement, ta carte est refusée. L'argent est là, mais le système te ferme la porte.",
    deliverables_ht: [
      'Yon kat vityèl ki fonksyone, byen konfigire',
      'Yon metòd pou rechaje ak MonCash, NatCash oswa kripto',
      'Yon lis frè klè pou ou pa gen sipriz',
      'Aksè a vi ak tout mizajou',
    ],
    deliverables_fr: [
      'Une carte virtuelle fonctionnelle, bien configurée',
      'Une méthode pour recharger via MonCash, NatCash ou crypto',
      'Une liste de frais claire pour éviter les surprises',
      'Accès à vie avec toutes les mises à jour',
    ],
    requirements_ht: [
      'Yon telefòn ak koneksyon entènèt',
      'Yon pyès idantite',
      'Yon kont MonCash oswa NatCash',
    ],
    requirements_fr: [
      'Un téléphone et une connexion internet',
      'Une pièce d’identité',
      'Un compte MonCash ou NatCash',
    ],
    lessonDetails: [
      {
        minutes: 12,
        desc_ht: 'Konpare founisè kat vityèl yo epi chwazi sa ki pi bon pou ou.',
        desc_fr: 'Compare les fournisseurs de cartes virtuelles et choisis le bon.',
      },
      {
        minutes: 9,
        desc_ht: 'Pase etap verifikasyon an san fè erè ki ka bloke kont ou.',
        desc_fr: 'Passe la vérification sans erreurs qui bloqueraient ton compte.',
      },
      {
        minutes: 11,
        desc_ht: 'Mete lajan sou kat ou apati MonCash ak NatCash, etap pa etap.',
        desc_fr: 'Recharge ta carte depuis MonCash et NatCash, étape par étape.',
      },
      {
        minutes: 10,
        desc_ht: 'Sèvi ak kripto pou rechaje lè se opsyon ki pi bon mache a.',
        desc_fr: 'Utilise la crypto pour recharger quand c’est le moins cher.',
      },
      {
        minutes: 8,
        desc_ht: 'Kòmande yon kat fizik epi swiv li jiska li rive Ayiti.',
        desc_fr: 'Commande une carte physique et suis-la jusqu’en Haïti.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske m bezwen yon kont labank?',
        q_fr: 'Faut-il un compte bancaire ?',
        a_ht: 'Non. Tout pwen an se pou ou ka peye san kont labank ameriken.',
        a_fr: 'Non. Tout l’intérêt est de payer sans compte bancaire américain.',
      },
      {
        q_ht: 'Konbyen tan sa pran?',
        q_fr: 'Combien de temps ça prend ?',
        a_ht: 'Pifò moun gen yon kat k ap mache nan mwens pase yon èdtan.',
        a_fr: 'La plupart ont une carte qui marche en moins d’une heure.',
      },
      {
        q_ht: 'Èske kat la mache sou Amazon ak Netflix?',
        q_fr: 'La carte marche sur Amazon et Netflix ?',
        a_ht: 'Wi, sou pifò sit ak abònman entènasyonal.',
        a_fr: 'Oui, sur la plupart des sites et abonnements internationaux.',
      },
    ],
  },

  'PA-02': {
    level_ht: 'Debitan',
    level_fr: 'Débutant',
    promise_ht:
      "W ap konn achte sou Amazon, Shein ak Alibaba ak konfyans, epi resevwa machandiz ou Ayiti san pèdi lajan.",
    promise_fr:
      "Tu sauras acheter sur Amazon, Shein et Alibaba en confiance, et recevoir tes produits en Haïti sans perdre d’argent.",
    problem_ht:
      "Ou pè achte sou entènèt: pè yo pran lajan w, pè machandiz la pa rive, pè frè kache. Konsa ou kontinye peye pi chè lokalman.",
    problem_fr:
      "Tu as peur d’acheter en ligne : qu’on te prenne ton argent, que le produit n’arrive pas, des frais cachés. Du coup tu paies plus cher localement.",
    deliverables_ht: [
      'Yon metòd pou konpare pri ant platfòm yo',
      'Yon chèk-lis pou rekonèt bon founisè',
      'Yon konpreyansyon klè sou frè douàn',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Une méthode pour comparer les prix entre plateformes',
      'Une check-list pour reconnaître les bons fournisseurs',
      'Une compréhension claire des frais de douane',
      'Accès à vie',
    ],
    requirements_ht: [
      'Yon kat pou peye entènasyonal (gade PA-01)',
      'Yon adrès pou resevwa oswa yon depo',
    ],
    requirements_fr: [
      'Une carte pour payer à l’international (voir PA-01)',
      'Une adresse de réception ou un entrepôt',
    ],
    lessonDetails: [
      {
        minutes: 10,
        desc_ht: 'Jwenn menm pwodwi a mwens chè sou plizyè platfòm.',
        desc_fr: 'Trouve le même produit moins cher sur plusieurs plateformes.',
      },
      {
        minutes: 12,
        desc_ht: 'Pale ak founisè sou Alibaba epi jwenn pi bon pri ak kondisyon.',
        desc_fr: 'Discute avec les fournisseurs sur Alibaba pour de meilleurs prix.',
      },
      {
        minutes: 9,
        desc_ht: 'Konprann konbyen w ap peye nan douàn anvan ou kòmande.',
        desc_fr: 'Comprends ce que tu paieras en douane avant de commander.',
      },
      {
        minutes: 8,
        desc_ht: 'Swiv kòmand ou epi konnen kisa pou fè si gen pwoblèm.',
        desc_fr: 'Suis ta commande et sache quoi faire en cas de problème.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske se sèlman pou revandè?',
        q_fr: 'C’est seulement pour les revendeurs ?',
        a_ht: 'Non, menm pou achte pou tèt ou, w ap ekonomize lajan.',
        a_fr: 'Non, même pour acheter pour toi, tu économises.',
      },
      {
        q_ht: 'E si machandiz la pa rive?',
        q_fr: 'Et si le produit n’arrive pas ?',
        a_ht: 'W ap aprann ki pwoteksyon platfòm yo bay ak kijan pou reklame.',
        a_fr: 'Tu apprendras les protections des plateformes et comment réclamer.',
      },
      {
        q_ht: 'Èske m bezwen anglè?',
        q_fr: 'Faut-il parler anglais ?',
        a_ht: 'Non, n ap montre w kijan pou navige menm san anglè.',
        a_fr: 'Non, on te montre comment naviguer même sans anglais.',
      },
    ],
  },

  'PA-03': {
    level_ht: 'Entèmedyè',
    level_fr: 'Intermédiaire',
    promise_ht:
      "W ap gen yon plan konplè pou louvri pwòp biznis shipping Etazini–Ayiti ou, ak premye kliyan ou yo.",
    promise_fr:
      "Tu auras un plan complet pour ouvrir ton propre business de shipping USA–Haïti, avec tes premiers clients.",
    problem_ht:
      "Moun toujou bezwen voye bagay soti Etazini rive Ayiti, men ou pa konn kijan pou kòmanse: ki depo, ki pri, ki dokiman. Konsa lajan an pase devan ou.",
    problem_fr:
      "Les gens ont toujours besoin d’envoyer des choses des USA vers Haïti, mais tu ne sais pas comment démarrer : quel entrepôt, quels prix, quels documents. Et l’argent te passe sous le nez.",
    deliverables_ht: [
      'Yon modèl pou kalkile pri pa pwa',
      'Yon lis dokiman ak etap douàn',
      'Yon plan pou jwenn premye kliyan ou yo',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Un modèle pour calculer le prix au poids',
      'Une liste des documents et étapes de douane',
      'Un plan pour trouver tes premiers clients',
      'Accès à vie',
    ],
    requirements_ht: [
      'Yon kontak oswa yon adrès nan zòn Miami',
      'Yon ti bidjè pou kòmanse',
    ],
    requirements_fr: [
      'Un contact ou une adresse dans la zone de Miami',
      'Un petit budget de départ',
    ],
    lessonDetails: [
      {
        minutes: 14,
        desc_ht: 'Jwenn yon depo nan Miami epi negosye bon kondisyon.',
        desc_fr: 'Trouve un entrepôt à Miami et négocie de bonnes conditions.',
      },
      {
        minutes: 12,
        desc_ht: 'Mete yon pri pa liv ki fè ou genyen san ou pa twò chè.',
        desc_fr: 'Fixe un prix au poids qui te rapporte sans être trop cher.',
      },
      {
        minutes: 11,
        desc_ht: 'Prepare bon dokiman yo pou evite blokaj nan douàn.',
        desc_fr: 'Prépare les bons documents pour éviter les blocages en douane.',
      },
      {
        minutes: 12,
        desc_ht: 'Jwenn premye kliyan ou yo nan zòn ou ak sou rezo sosyal.',
        desc_fr: 'Trouve tes premiers clients dans ta zone et sur les réseaux.',
      },
      {
        minutes: 10,
        desc_ht: 'Jere kòmand, peman ak livrezon san dezòd.',
        desc_fr: 'Gère commandes, paiements et livraisons sans désordre.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske m bezwen anpil lajan pou kòmanse?',
        q_fr: 'Faut-il beaucoup d’argent pour démarrer ?',
        a_ht: 'Non, ou ka kòmanse piti epi grandi avèk premye kliyan yo.',
        a_fr: 'Non, tu peux démarrer petit et grandir avec tes premiers clients.',
      },
      {
        q_ht: 'Èske mwen oblije al Miami?',
        q_fr: 'Dois-je aller à Miami ?',
        a_ht: 'Pa nesesèman — w ap aprann kijan pou travay ak yon depo adistans.',
        a_fr: 'Pas forcément — tu apprendras à travailler avec un entrepôt à distance.',
      },
      {
        q_ht: 'Konbyen tan pou premye kliyan?',
        q_fr: 'Combien de temps pour le premier client ?',
        a_ht: 'Ak plan maketing nan, anpil moun jwenn premye kliyan nan kèk semèn.',
        a_fr: 'Avec le plan marketing, beaucoup en trouvent en quelques semaines.',
      },
    ],
  },

  'PA-04': {
    level_ht: 'Debitan',
    level_fr: 'Débutant',
    promise_ht:
      "W ap konn fè biznis ou parèt sou Instagram ak TikTok epi tounen moun k ap gade an moun k ap achte.",
    promise_fr:
      "Tu sauras rendre ton business visible sur Instagram et TikTok et transformer les curieux en acheteurs.",
    problem_ht:
      "Ou poste, men se zanmi w sèlman ki wè. Pa gen vant ki soti ladan l. Ou pa konn kisa pou di ni kijan pou fè moun achte.",
    problem_fr:
      "Tu publies, mais seuls tes amis voient. Aucune vente n’en sort. Tu ne sais pas quoi dire ni comment faire acheter.",
    deliverables_ht: [
      'Yon paj biznis ki parèt pwofesyonèl',
      'Modèl pou ekri pòs ki vann',
      'Yon premye kanpay piblisite',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Une page business qui paraît professionnelle',
      'Des modèles de posts qui vendent',
      'Une première campagne publicitaire',
      'Accès à vie',
    ],
    requirements_ht: [
      'Yon paj Instagram oswa TikTok',
      'Yon ti bidjè piblisite (opsyonèl)',
    ],
    requirements_fr: [
      'Une page Instagram ou TikTok',
      'Un petit budget pub (optionnel)',
    ],
    lessonDetails: [
      {
        minutes: 10,
        desc_ht: 'Mete kanpe yon paj ki bay konfyans depi premye gade.',
        desc_fr: 'Crée une page qui inspire confiance dès le premier regard.',
      },
      {
        minutes: 12,
        desc_ht: 'Ekri pòs ak deskripsyon ki pouse moun achte.',
        desc_fr: 'Écris des posts et descriptions qui poussent à l’achat.',
      },
      {
        minutes: 13,
        desc_ht: 'Lanse yon premye piblisite ak yon ti bidjè epi sible bon moun.',
        desc_fr: 'Lance une première pub avec un petit budget et cible les bonnes personnes.',
      },
      {
        minutes: 9,
        desc_ht: 'Konprann ki piblisite k ap mache epi ajiste.',
        desc_fr: 'Comprends quelle pub marche et ajuste.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske m bezwen anpil abònè?',
        q_fr: 'Faut-il beaucoup d’abonnés ?',
        a_ht: 'Non, menm ak yon ti kominote, bon mesaj la fè vant.',
        a_fr: 'Non, même avec une petite communauté, le bon message fait vendre.',
      },
      {
        q_ht: 'Konbyen bidjè piblisite?',
        q_fr: 'Quel budget pub ?',
        a_ht: 'Ou ka kòmanse ak kèk dola pa jou epi monte selon rezilta.',
        a_fr: 'Tu peux commencer à quelques dollars par jour et monter selon les résultats.',
      },
      {
        q_ht: 'Èske sa mache pou nenpòt biznis?',
        q_fr: 'Ça marche pour tout business ?',
        a_ht: 'Wi, kit ou vann pwodwi oswa sèvis.',
        a_fr: 'Oui, que tu vendes des produits ou des services.',
      },
    ],
  },

  'PA-05': {
    level_ht: 'Debitan',
    level_fr: 'Débutant',
    promise_ht:
      "W ap konn fè flyer pwofesyonèl pou biznis ou nan kèk minit, san peye yon grafis.",
    promise_fr:
      "Tu sauras créer des flyers professionnels pour ton business en quelques minutes, sans payer de graphiste.",
    problem_ht:
      "Flyer ou yo parèt fèt alamen, epi sa fè biznis ou parèt mwens serye. Men yon grafis koute chè epi pran tan.",
    problem_fr:
      "Tes flyers ont l’air faits à la main, et ça rend ton business moins sérieux. Mais un graphiste coûte cher et prend du temps.",
    deliverables_ht: [
      'Plizyè flyer pwo pou biznis ou',
      'Yon lis bon pwonp ki bay bon rezilta',
      'Bon fòma pou enprime ak rezo',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Plusieurs flyers pro pour ton business',
      'Une liste de bons prompts qui donnent de bons résultats',
      'Les bons formats pour l’impression et les réseaux',
      'Accès à vie',
    ],
    requirements_ht: ['Yon telefòn oswa yon òdinatè', 'Aksè entènèt'],
    requirements_fr: ['Un téléphone ou un ordinateur', 'Un accès internet'],
    lessonDetails: [
      {
        minutes: 8,
        desc_ht: 'Dekouvri zouti IA ki pèmèt ou fè vizyèl gratis.',
        desc_fr: 'Découvre les outils IA pour créer des visuels gratuitement.',
      },
      {
        minutes: 12,
        desc_ht: 'Ekri pwonp ki bay yon flyer pwo depi premye esè.',
        desc_fr: 'Écris des prompts qui donnent un flyer pro dès le premier essai.',
      },
      {
        minutes: 10,
        desc_ht: 'Chanje koulè, tèks ak background pou matche ak mak ou.',
        desc_fr: 'Change couleurs, texte et fond pour coller à ta marque.',
      },
      {
        minutes: 7,
        desc_ht: 'Ekspòte nan bon fòma pou enprime ak pou rezo sosyal.',
        desc_fr: 'Exporte dans les bons formats pour l’impression et les réseaux.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske m bezwen konn desine?',
        q_fr: 'Faut-il savoir dessiner ?',
        a_ht: 'Non, IA a fè desen an, ou jis dirije l.',
        a_fr: 'Non, l’IA dessine, tu la diriges.',
      },
      {
        q_ht: 'Èske zouti yo gratis?',
        q_fr: 'Les outils sont-ils gratuits ?',
        a_ht: 'Gen vèsyon gratis ki sifi pou kòmanse.',
        a_fr: 'Il y a des versions gratuites suffisantes pour commencer.',
      },
      {
        q_ht: 'Èske m ka enprime yo?',
        q_fr: 'Puis-je les imprimer ?',
        a_ht: 'Wi, w ap aprann bon fòma pou enprime san pèdi kalite.',
        a_fr: 'Oui, tu apprendras les bons formats sans perdre en qualité.',
      },
    ],
  },

  'PA-06': {
    level_ht: 'Entèmedyè',
    level_fr: 'Intermédiaire',
    promise_ht:
      "Biznis ou ap reponn kliyan otomatikman sou WhatsApp ak Telegram, menm lè w ap dòmi.",
    promise_fr:
      "Ton business répondra automatiquement aux clients sur WhatsApp et Telegram, même quand tu dors.",
    problem_ht:
      "Ou pèdi vant paske ou pa reponn ase vit, oswa ou pase tout jounen ap reponn menm kesyon yo. Ou bezwen èd, men anplwaye koute chè.",
    problem_fr:
      "Tu perds des ventes faute de répondre assez vite, ou tu passes la journée à répondre aux mêmes questions. Tu as besoin d’aide, mais un employé coûte cher.",
    deliverables_ht: [
      'Yon bot ki konekte ak WhatsApp biznis ou',
      'Repons otomatik ki bay pri ak enfo',
      'Yon bot Telegram tou',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Un bot connecté à ton WhatsApp business',
      'Des réponses automatiques qui donnent prix et infos',
      'Un bot Telegram aussi',
      'Accès à vie',
    ],
    requirements_ht: ['Yon nimewo WhatsApp Business', 'Yon telefòn oswa òdinatè'],
    requirements_fr: ['Un numéro WhatsApp Business', 'Un téléphone ou ordinateur'],
    lessonDetails: [
      {
        minutes: 13,
        desc_ht: 'Konekte bot la ak nimewo WhatsApp Business ou.',
        desc_fr: 'Connecte le bot à ton numéro WhatsApp Business.',
      },
      {
        minutes: 12,
        desc_ht: 'Konfigire bot la pou l bay pri jounen an ak repons rapid.',
        desc_fr: 'Configure le bot pour donner les prix du jour et des réponses rapides.',
      },
      {
        minutes: 9,
        desc_ht: 'Mete menm bot la sou Telegram pou plis kliyan.',
        desc_fr: 'Mets le même bot sur Telegram pour plus de clients.',
      },
      {
        minutes: 10,
        desc_ht: 'Teste bot la epi konnen kilè pou pase bay yon moun.',
        desc_fr: 'Teste le bot et sache quand passer à un humain.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske m bezwen konn kode?',
        q_fr: 'Faut-il savoir coder ?',
        a_ht: 'Non, n ap sèvi ak zouti ki pa mande pwogramasyon.',
        a_fr: 'Non, on utilise des outils sans programmation.',
      },
      {
        q_ht: 'Èske l ap ranplase mwen nèt?',
        q_fr: 'Ça me remplace totalement ?',
        a_ht: 'Non, l ap okipe baz la epi pase ka konplike yo ba ou.',
        a_fr: 'Non, il gère la base et te passe les cas compliqués.',
      },
      {
        q_ht: 'Èske se pou gwo biznis sèlman?',
        q_fr: 'C’est pour les gros business ?',
        a_ht: 'Non, menm yon ti biznis ekonomize tan ak vant.',
        a_fr: 'Non, même un petit business gagne du temps et des ventes.',
      },
    ],
  },

  'PA-07': {
    level_ht: 'Entèmedyè',
    level_fr: 'Intermédiaire',
    promise_ht:
      "W ap bay lide w lavi: yon sit oswa yon app ki pibliye sou App Store ak Play Store — san konn pwograme.",
    promise_fr:
      "Tu donneras vie à ton idée : un site ou une app publié sur App Store et Play Store — sans savoir programmer.",
    problem_ht:
      "Ou gen yon bon lide app oswa sit, men devlopè mande dè milye dola, epi ou pa konn kòd. Konsa lide a rete nan tèt ou.",
    problem_fr:
      "Tu as une bonne idée d’app ou de site, mais les développeurs demandent des milliers de dollars, et tu ne connais pas le code. L’idée reste dans ta tête.",
    deliverables_ht: [
      'Yon sit entènèt konplè pou biznis ou',
      'Yon premye vèsyon app mobil ou',
      'Etap pou pibliye sou App Store ak Play Store',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Un site web complet pour ton business',
      'Une première version de ton app mobile',
      'Les étapes pour publier sur App Store et Play Store',
      'Accès à vie',
    ],
    requirements_ht: [
      'Yon òdinatè',
      'Yon kont devlopè (n ap montre w)',
      'Pasyans pou suiv etap yo',
    ],
    requirements_fr: [
      'Un ordinateur',
      'Un compte développeur (on te montre)',
      'De la patience pour suivre les étapes',
    ],
    lessonDetails: [
      {
        minutes: 12,
        desc_ht: 'Dekouvri zouti IA ki konstwi sit ak app pou ou.',
        desc_fr: 'Découvre les outils IA qui construisent sites et apps pour toi.',
      },
      {
        minutes: 14,
        desc_ht: 'Soti nan yon lide rive nan yon sit konplè ki an liy.',
        desc_fr: 'Pars d’une idée pour arriver à un site complet en ligne.',
      },
      {
        minutes: 15,
        desc_ht: 'Konstwi yon premye vèsyon app mobil ou.',
        desc_fr: 'Construis une première version de ton app mobile.',
      },
      {
        minutes: 12,
        desc_ht: 'Prepare epi soumèt app ou sou App Store.',
        desc_fr: 'Prépare et soumets ton app sur l’App Store.',
      },
      {
        minutes: 10,
        desc_ht: 'Soumèt app ou sou Play Store epi pibliye l.',
        desc_fr: 'Soumets ton app sur le Play Store et publie-la.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske vrèman san kode?',
        q_fr: 'Vraiment sans coder ?',
        a_ht: 'Wi, ou dirije IA a ak mo, li ekri kòd la pou ou.',
        a_fr: 'Oui, tu diriges l’IA avec des mots, elle écrit le code.',
      },
      {
        q_ht: 'Konbyen sa koute pou pibliye?',
        q_fr: 'Combien coûte la publication ?',
        a_ht: 'Genyen kèk frè kont devlopè; n ap di w egzakteman.',
        a_fr: 'Il y a des frais de compte développeur ; on te le dit exactement.',
      },
      {
        q_ht: 'Èske app la ap serye?',
        q_fr: 'L’app sera-t-elle sérieuse ?',
        a_ht: 'Wi, ou ka kòmanse senp epi amelyore l apre.',
        a_fr: 'Oui, tu commences simple puis tu l’améliores.',
      },
    ],
  },

  'PA-08': {
    level_ht: 'Debitan',
    level_fr: 'Débutant',
    promise_ht:
      "W ap konn rekonèt yon eskrokri anvan li pran lajan w, epi sekirize tout kont ou yo.",
    promise_fr:
      "Tu sauras reconnaître une arnaque avant qu’elle prenne ton argent, et sécuriser tous tes comptes.",
    problem_ht:
      "Eskwo yo pi prè pase ou panse: fo mesaj, fo paj, fo pwomès. Yon sèl erè ka koute w tout sa w gen sou kont ou.",
    problem_fr:
      "Les arnaqueurs sont plus proches que tu crois : faux messages, fausses pages, fausses promesses. Une seule erreur peut te coûter tout ce que tu as.",
    deliverables_ht: [
      'Yon chèk-lis pou rekonèt eskrokri',
      'Kont ou yo byen sekirize',
      'Yon plan pou reyaji si yo pirate w',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Une check-list pour reconnaître les arnaques',
      'Tes comptes bien sécurisés',
      'Un plan pour réagir si on te pirate',
      'Accès à vie',
    ],
    requirements_ht: ['Yon telefòn ak kont ou vle pwoteje'],
    requirements_fr: ['Un téléphone et les comptes que tu veux protéger'],
    lessonDetails: [
      {
        minutes: 10,
        desc_ht: 'Aprann siy ki montre yon mesaj oswa paj se eskrokri.',
        desc_fr: 'Apprends les signes qui trahissent un message ou une page d’arnaque.',
      },
      {
        minutes: 11,
        desc_ht: 'Mete modpas solid ak verifikasyon an de etap toupatou.',
        desc_fr: 'Mets des mots de passe solides et la vérification en deux étapes partout.',
      },
      {
        minutes: 8,
        desc_ht: 'Konnen egzakteman kisa pou fè si yo pirate yon kont.',
        desc_fr: 'Sache exactement quoi faire si un compte est piraté.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske se teknik?',
        q_fr: 'C’est technique ?',
        a_ht: 'Non, se bon abitid senp ki pwoteje w.',
        a_fr: 'Non, ce sont de simples bonnes habitudes qui te protègent.',
      },
      {
        q_ht: 'Mwen deja pèdi lajan, èske twò ta?',
        q_fr: 'J’ai déjà perdu de l’argent, trop tard ?',
        a_ht: 'Non, w ap aprann kijan pou limite domaj epi pwoteje rès la.',
        a_fr: 'Non, tu apprendras à limiter les dégâts et protéger le reste.',
      },
      {
        q_ht: 'Èske sa pran lontan?',
        q_fr: 'Ça prend longtemps ?',
        a_ht: 'Non, ou ka sekirize kont prensipal yo nan menm jou a.',
        a_fr: 'Non, tu peux sécuriser tes comptes principaux le jour même.',
      },
    ],
  },

  'PA-09': {
    level_ht: 'Entèmedyè',
    level_fr: 'Intermédiaire',
    promise_ht:
      "W ap fè kontni ou travay pou ou: yon chèn ki pwodui regilyèman epi ki kòmanse rapòte lajan.",
    promise_fr:
      "Tu feras travailler ton contenu pour toi : une chaîne qui produit régulièrement et commence à rapporter.",
    problem_ht:
      "Ou wè moun ap fè lajan ak videyo, men ou pa konn ki sijè pou chwazi, kijan pou pwodui san kamera tout tan, ni kijan pou monetize.",
    problem_fr:
      "Tu vois des gens gagner avec des vidéos, mais tu ne sais pas quel sujet choisir, comment produire sans être tout le temps face caméra, ni comment monétiser.",
    deliverables_ht: [
      'Yon nich klè ak demann',
      'Yon sistèm pwodiksyon senp',
      'Yon plan pou aktive monetizasyon',
      'Aksè a vi',
    ],
    deliverables_fr: [
      'Une niche claire et demandée',
      'Un système de production simple',
      'Un plan pour activer la monétisation',
      'Accès à vie',
    ],
    requirements_ht: ['Yon telefòn', 'Aksè entènèt', 'Volonte pou poste regilyèman'],
    requirements_fr: ['Un téléphone', 'Un accès internet', 'La volonté de publier régulièrement'],
    lessonDetails: [
      {
        minutes: 11,
        desc_ht: 'Chwazi yon sijè ki gen demann epi ki pa twò konpetitif.',
        desc_fr: 'Choisis un sujet demandé et pas trop concurrentiel.',
      },
      {
        minutes: 12,
        desc_ht: 'Mete yon woutin pou pwodui kontni san pèdi tan.',
        desc_fr: 'Mets en place une routine pour produire du contenu sans perdre de temps.',
      },
      {
        minutes: 12,
        desc_ht: 'Ranpli kondisyon yo epi aktive monetizasyon.',
        desc_fr: 'Remplis les conditions et active la monétisation.',
      },
      {
        minutes: 9,
        desc_ht: 'Pibliye menm kontni an sou plizyè rezo pou plis vi.',
        desc_fr: 'Publie le même contenu sur plusieurs réseaux pour plus de vues.',
      },
    ],
    faq: [
      {
        q_ht: 'Èske m bezwen parèt nan kamera?',
        q_fr: 'Dois-je apparaître à la caméra ?',
        a_ht: 'Non, gen fòma ki mache san ou pa montre figi w.',
        a_fr: 'Non, il existe des formats sans montrer ton visage.',
      },
      {
        q_ht: 'Konbyen tan anvan lajan?',
        q_fr: 'Combien de temps avant de gagner ?',
        a_ht: 'Sa varye, men ak yon bon nich ak konstans, sa vini pi vit.',
        a_fr: 'Ça varie, mais avec une bonne niche et de la constance, ça vient plus vite.',
      },
      {
        q_ht: 'Èske se sèlman YouTube?',
        q_fr: 'C’est seulement YouTube ?',
        a_ht: 'Non, w ap aprann pou TikTok ak lòt rezo tou.',
        a_fr: 'Non, tu apprendras aussi pour TikTok et d’autres réseaux.',
      },
    ],
  },
};

export function getCourseDetail(code: string): CourseDetail | undefined {
  return courseDetails[code];
}
