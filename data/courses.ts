/**
 * Catalogue des 9 formations. Source unique de vérité pour l'UI.
 *
 * ⚠️ `priceUsd` = PRIX PLACEHOLDER. Un seul prix pour tout le monde (pas de
 * distinction local/diaspora). Remplace par les vrais prix avant le lancement.
 * L'équivalent gourdes est calculé automatiquement via lib/money.ts.
 */

export type Lesson = {
  title_ht: string;
  title_fr: string;
};

export type Course = {
  code: string;
  slug: string;
  /** Tabler icon key, mapped in components/courses/CourseIcon.tsx */
  icon: string;
  /** PLACEHOLDER price in USD — replace before launch. */
  priceUsd: number;
  title_ht: string;
  title_fr: string;
  tagline_ht: string;
  tagline_fr: string;
  learn_ht: string[];
  learn_fr: string[];
  audience_ht: string;
  audience_fr: string;
  lessons: Lesson[];
};

export const courses: Course[] = [
  {
    code: 'PA-01',
    slug: 'zouti-finansye-dijital',
    icon: 'credit-card',
    priceUsd: 9,
    title_ht: 'Zouti finansye dijital',
    title_fr: 'Outils financiers numériques',
    tagline_ht: 'Kat ou, lajan ou, anba kontwòl ou',
    tagline_fr: 'Ta carte, ton argent, sous ton contrôle',
    learn_ht: [
      'Kreye yon kat vityèl an mwens pase 10 minit',
      'Rechaje kat ou ak MonCash, NatCash oswa kripto',
      'Kòmande yon kat fizik epi resevwa l Ayiti',
      'Konprann ki frè w ap peye anvan w peye yo',
    ],
    learn_fr: [
      'Créer une carte virtuelle en moins de 10 minutes',
      'Recharger ta carte avec MonCash, NatCash ou en crypto',
      'Commander une carte physique et la recevoir en Haïti',
      'Comprendre les frais avant de les payer',
    ],
    audience_ht:
      'Nenpòt moun ki pa gen yon kont labank ameriken men ki bezwen peye sou entènèt.',
    audience_fr:
      "Toute personne sans compte bancaire américain qui doit payer en ligne.",
    lessons: [
      { title_ht: 'Chwazi bon founisè kat vityèl la', title_fr: 'Choisir le bon fournisseur de carte virtuelle' },
      { title_ht: 'Verifye idantite w san pwoblèm', title_fr: "Vérifier son identité sans accroc" },
      { title_ht: 'Rechaje ak MonCash ak NatCash', title_fr: 'Recharger via MonCash et NatCash' },
      { title_ht: 'Rechaje ak kripto', title_fr: 'Recharger en crypto' },
      { title_ht: 'Kòmande epi resevwa kat fizik ou', title_fr: 'Commander et recevoir sa carte physique' },
    ],
  },
  {
    code: 'PA-02',
    slug: 'achte-amazon-shein-alibaba',
    icon: 'shopping-cart',
    priceUsd: 12,
    title_ht: 'Achte sou Amazon, Shein, Alibaba',
    title_fr: 'Acheter sur Amazon, Shein, Alibaba',
    tagline_ht: 'Achte nan tout mond lan, san pèdi kòb nan entèmedyè',
    tagline_fr: "Achète partout dans le monde, sans perdre d'argent en intermédiaires",
    learn_ht: [
      'Konpare pri sou plizyè platfòm anvan ou achte',
      'Rekonèt yon bon founisè sou Alibaba',
      'Swiv yon kòmand depi nan kòmansman jiska lafen, ladwàn ladan l',
      'Evite pyèj ki pi kouran lè w ap achte sou entènèt',
    ],
    learn_fr: [
      "Comparer les prix sur plusieurs plateformes avant d'acheter",
      'Identifier un bon fournisseur sur Alibaba',
      'Suivre une commande de A à Z, douane incluse',
      "Éviter les pièges courants à l'achat en ligne",
    ],
    audience_ht: 'Moun k ap achte pou tèt yo oswa pou revann.',
    audience_fr: 'Ceux qui achètent pour eux-mêmes ou pour revendre.',
    lessons: [
      { title_ht: 'Konpare pri ak founisè', title_fr: 'Comparer prix et fournisseurs' },
      { title_ht: 'Negosye sou Alibaba', title_fr: 'Négocier sur Alibaba' },
      { title_ht: 'Konprann frè ladwàn', title_fr: 'Comprendre les frais de douane' },
      { title_ht: 'Swiv epi resevwa kòmand ou', title_fr: 'Suivre et recevoir sa commande' },
    ],
  },
  {
    code: 'PA-03',
    slug: 'biznis-shipping',
    icon: 'ship',
    priceUsd: 39,
    title_ht: 'Biznis shipping Etazini-Ayiti',
    title_fr: 'Business shipping USA-Haïti',
    tagline_ht: 'Monte pwòp biznis ekspedisyon ou, soti nan zewo',
    tagline_fr: "Monte ton propre business d'expédition, à partir de zéro",
    learn_ht: [
      'Jwenn epi negosye ak yon depo nan Miami',
      'Kalkile yon pri pa pwa pou chak voyaj',
      'Jere ladwàn ak dokiman ki nesesè yo',
      'Jwenn premye kliyan ou yo',
    ],
    learn_fr: [
      'Trouver et négocier avec un entrepôt à Miami',
      'Calculer un prix au poids pour chaque envoi',
      'Gérer la douane et les documents nécessaires',
      'Trouver tes premiers clients',
    ],
    audience_ht: 'Moun ki vle yon vrè biznis, pa yon sèvis yon sèl fwa.',
    audience_fr: 'Ceux qui veulent un vrai business, pas un service ponctuel.',
    lessons: [
      { title_ht: 'Chwazi epi negosye ak yon depo nan Miami', title_fr: 'Choisir et négocier avec un entrepôt à Miami' },
      { title_ht: 'Etabli yon barèm pri pa pwa', title_fr: 'Établir une grille de prix au poids' },
      { title_ht: 'Dokiman ak ladwàn', title_fr: 'Documents et douane' },
      { title_ht: 'Maketing lokal pou jwenn kliyan', title_fr: 'Marketing local pour trouver des clients' },
      { title_ht: 'Jere operasyon chak jou yo', title_fr: 'Gérer les opérations quotidiennes' },
    ],
  },
  {
    code: 'PA-04',
    slug: 'maketing-dijital',
    icon: 'speakerphone',
    priceUsd: 19,
    title_ht: 'Maketing dijital',
    title_fr: 'Marketing digital',
    tagline_ht: 'Fè moun konnen biznis ou egziste — vrèman',
    tagline_fr: 'Fais savoir que ton business existe — vraiment',
    learn_ht: [
      'Kreye yon paj biznis ki vann sou Instagram ak TikTok',
      'Ekri yon mesaj ki fè moun achte, pa annik bay like',
      'Lanse yon premye kanpay piblisite ak yon ti bidjè',
      'Mezire si piblisite w ap mache vrèman',
    ],
    learn_fr: [
      'Créer une page business qui vend sur Instagram et TikTok',
      "Écrire un message qui fait acheter, pas juste liker",
      'Lancer une première campagne pub avec un petit budget',
      'Mesurer si ta pub fonctionne vraiment',
    ],
    audience_ht: 'Moun ki gen yon biznis men pèsòn poko konnen.',
    audience_fr: "Ceux qui ont un business que personne ne connaît encore.",
    lessons: [
      { title_ht: 'Mete kanpe yon paj biznis pwofesyonèl', title_fr: 'Mettre en place une page business professionnelle' },
      { title_ht: 'Ekri kontni ki vann', title_fr: 'Écrire du contenu qui vend' },
      { title_ht: 'Lanse piblisite sou Meta ak TikTok', title_fr: 'Lancer des pubs sur Meta et TikTok' },
      { title_ht: 'Li chif yo epi ajiste', title_fr: 'Lire les chiffres et ajuster' },
    ],
  },
  {
    code: 'PA-05',
    slug: 'ia-flyer-pwofesyonel',
    icon: 'palette',
    priceUsd: 14,
    title_ht: 'IA pou flyer pwofesyonèl',
    title_fr: 'IA pour flyers professionnels',
    tagline_ht: 'Yon flyer pwo, san peye yon grafis',
    tagline_fr: 'Un flyer pro, sans payer de graphiste',
    learn_ht: [
      'Ekri yon pwonp ki bay yon rezilta pwo',
      'Kreye yon flyer pou biznis ou an 15 minit',
      'Ajiste koulè ak background pou matche ak mak ou',
      'Ekspòte nan bon fòma pou enprime ak rezo sosyal',
    ],
    learn_fr: [
      'Écrire un prompt qui donne un résultat pro',
      'Créer un flyer pour ton business en 15 minutes',
      'Ajuster couleurs et fond pour matcher ta marque',
      "Exporter dans les bons formats pour l'impression et les réseaux",
    ],
    audience_ht: 'Tout machann ki bezwen vizyèl san bidjè pou yon grafis.',
    audience_fr: 'Tout commerçant qui a besoin de visuels sans budget graphiste.',
    lessons: [
      { title_ht: 'Zouti IA ki disponib gratis', title_fr: 'Outils IA disponibles gratuitement' },
      { title_ht: 'Ekri yon bon pwonp', title_fr: 'Écrire un bon prompt' },
      { title_ht: 'Amelyore epi ajiste rezilta a', title_fr: 'Améliorer et ajuster le résultat' },
      { title_ht: 'Ekspòte pou enprime ak rezo', title_fr: 'Exporter pour impression et réseaux' },
    ],
  },
  {
    code: 'PA-06',
    slug: 'ia-whatsapp-telegram',
    icon: 'brand-whatsapp',
    priceUsd: 24,
    title_ht: 'IA pou WhatsApp ak Telegram',
    title_fr: 'IA pour WhatsApp et Telegram',
    tagline_ht: 'Biznis ou reponn kliyan, menm lè w ap dòmi',
    tagline_fr: 'Ton business répond aux clients, même quand tu dors',
    learn_ht: [
      'Konekte yon bot ak nimewo WhatsApp biznis ou',
      'Pwograme bot la pou l bay pri jounen an otomatikman',
      'Reponn kesyon ki pi kouran yo san manyen telefòn ou',
      'Konnen kilè pou pase konvèsasyon an bay yon moun',
    ],
    learn_fr: [
      'Connecter un bot à ton numéro WhatsApp business',
      'Programmer le bot pour donner les prix du jour automatiquement',
      'Répondre aux questions fréquentes sans toucher son téléphone',
      'Savoir quand transférer la conversation à un humain',
    ],
    audience_ht: 'Moun k ap resevwa menm kesyon yo tout lajounen.',
    audience_fr: 'Ceux qui reçoivent les mêmes questions toute la journée.',
    lessons: [
      { title_ht: 'Konekte API WhatsApp Business', title_fr: "Connecter l'API WhatsApp Business" },
      { title_ht: 'Konfigire repons otomatik chak jou', title_fr: 'Configurer les réponses automatiques quotidiennes' },
      { title_ht: 'Konekte bot la ak Telegram', title_fr: 'Connecter le bot à Telegram' },
      { title_ht: 'Teste epi amelyore bot ou', title_fr: 'Tester et améliorer son bot' },
    ],
  },
  {
    code: 'PA-07',
    slug: 'ia-sit-ak-app',
    icon: 'device-mobile-code',
    priceUsd: 49,
    title_ht: 'IA pou kreye sit ak app',
    title_fr: 'IA pour créer site et app',
    tagline_ht: 'Bay lide ou lavi — san konn pwograme',
    tagline_fr: 'Donne vie à tes idées — sans savoir programmer',
    learn_ht: [
      'Esplike lide ou bay yon IA pou l konstwi l',
      'Kreye yon sit entènèt konplè pou biznis ou',
      'Konstwi yon premye vèsyon app mobil ou',
      'Pibliye app ou sou App Store ak Play Store',
    ],
    learn_fr: [
      'Expliquer ton idée à une IA pour qu’elle la construise',
      'Créer un site web complet pour ton business',
      'Construire une première version de ton app mobile',
      'Publier ton app sur App Store et Play Store',
    ],
    audience_ht:
      'Moun ki gen yon lide sit oswa app men ki pa gen okenn konpetans teknik.',
    audience_fr:
      "Ceux qui ont une idée de site ou d'app mais aucune compétence technique.",
    lessons: [
      { title_ht: 'Premye pa ak yon zouti IA pou devlopman', title_fr: 'Premiers pas avec un outil IA de développement' },
      { title_ht: 'Konstwi yon sit apati yon lide', title_fr: 'Construire un site à partir d’une idée' },
      { title_ht: 'Konstwi yon premye app mobil', title_fr: 'Construire une première app mobile' },
      { title_ht: 'Prepare epi soumèt sou App Store', title_fr: 'Préparer et soumettre sur App Store' },
      { title_ht: 'Soumèt sou Play Store', title_fr: 'Soumettre sur Play Store' },
    ],
  },
  {
    code: 'PA-08',
    slug: 'sekirite-anti-eskrokri',
    icon: 'shield-lock',
    priceUsd: 7,
    title_ht: 'Sekirite ak evite eskrokri',
    title_fr: 'Sécurité et anti-arnaque',
    tagline_ht: 'Pwoteje lajan ou anvan yon moun pran l',
    tagline_fr: "Protège ton argent avant que quelqu'un ne le prenne",
    learn_ht: [
      'Rekonèt yon eskrokri anvan ou pèdi lajan',
      'Sekirize kont kat vityèl ak rezo sosyal ou yo',
      'Aktive verifikasyon an de etap kòrèkteman',
      'Reyaji kòrèkteman si yo pirate yon kont',
    ],
    learn_fr: [
      "Reconnaître une arnaque avant de perdre de l'argent",
      'Sécuriser ses comptes carte virtuelle et réseaux sociaux',
      'Activer correctement la vérification en deux étapes',
      'Réagir correctement si un compte est piraté',
    ],
    audience_ht: 'Tout moun k ap sèvi ak lajan ak rezo sosyal sou entènèt.',
    audience_fr: "Tous ceux qui utilisent l'argent et les réseaux en ligne.",
    lessons: [
      { title_ht: 'Rekonèt pyèj ki pi kouran yo', title_fr: 'Reconnaître les pièges courants' },
      { title_ht: 'Sekirize kont ou yo', title_fr: 'Sécuriser ses comptes' },
      { title_ht: 'Reyaji lè gen yon pwoblèm', title_fr: 'Réagir en cas de problème' },
    ],
  },
  {
    code: 'PA-09',
    slug: 'monetize-kontni',
    icon: 'player-play',
    priceUsd: 17,
    title_ht: 'Monetize ak kontni',
    title_fr: 'Monétiser avec du contenu',
    tagline_ht: 'Fè kontni ou travay pou ou, chak jou',
    tagline_fr: 'Fais travailler ton contenu pour toi, chaque jour',
    learn_ht: [
      'Chwazi yon nich ki gen yon vrè demann',
      'Monte yon chèn YouTube ki pwodui san ou pa toujou devan kamera a',
      'Aktive monetizasyon epi jwenn premye revni ou yo',
      'Gaye kontni an sou plizyè platfòm',
    ],
    learn_fr: [
      'Choisir une niche qui a une vraie demande',
      'Monter une chaîne YouTube qui produit sans toujours être devant la caméra',
      'Activer la monétisation et obtenir ses premiers revenus',
      'Diffuser le contenu sur plusieurs plateformes',
    ],
    audience_ht: 'Moun ki vle yon revni regilye apati kontni.',
    audience_fr: 'Ceux qui veulent un revenu régulier à partir de contenu.',
    lessons: [
      { title_ht: 'Chwazi nich ou', title_fr: 'Choisir sa niche' },
      { title_ht: 'Mete kanpe yon sistèm pwodiksyon senp', title_fr: 'Mettre en place un système de production simple' },
      { title_ht: 'Aktive epi swiv revni monetizasyon', title_fr: 'Activer et suivre les revenus de monétisation' },
      { title_ht: 'Gaye kontni an sou plizyè rezo', title_fr: 'Diffuser le contenu sur plusieurs réseaux' },
    ],
  },
];

export function getCourse(slug: string): Course | undefined {
  return courses.find((c) => c.slug === slug);
}
