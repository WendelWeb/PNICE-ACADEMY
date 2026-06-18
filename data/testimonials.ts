/**
 * EXEMPLE — À REMPLACER avant le lancement public.
 * Ces témoignages et ce compteur de places sont des PLACEHOLDERS de structure.
 * Ne jamais les présenter comme réels. L'UI affiche un marqueur « exemple ».
 */

export type Testimonial = {
  id: string;
  name: string;
  location: string;
  quote_ht: string;
  quote_fr: string;
  isPlaceholder: true;
};

export const testimonials: Testimonial[] = [
  {
    id: 't1',
    name: 'Djenane',
    location: 'Okap',
    quote_ht:
      'Mwen te kreye premye kat vityèl mwen menm jou a epi mwen kòmanse achte sou Shein san pwoblèm.',
    quote_fr:
      "J'ai créé ma première carte virtuelle le jour même et j'ai commencé à acheter sur Shein sans problème.",
    isPlaceholder: true,
  },
  {
    id: 't2',
    name: 'Peterson',
    location: 'Miami',
    quote_ht:
      'Fòmasyon shipping lan ban mwen yon plan klè pou louvri pwòp biznis ekspedisyon mwen.',
    quote_fr:
      "La formation shipping m'a donné un plan clair pour ouvrir mon propre business d'expédition.",
    isPlaceholder: true,
  },
  {
    id: 't3',
    name: 'Naomie',
    location: 'Pòtoprens',
    quote_ht:
      'Ak IA a, mwen fè flyer pou biznis mwen nan kèk minit, san peye yon grafis.',
    quote_fr:
      "Avec l'IA, je fais les flyers de mon business en quelques minutes, sans payer de graphiste.",
    isPlaceholder: true,
  },
];

/** PLACEHOLDER — replace with a real seats counter before launch. */
export const SEATS_LEFT_PLACEHOLDER = 12;
