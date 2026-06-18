import { toHtg } from '@/lib/money';

/**
 * Money model: a $79/month subscription unlocks the whole catalog, OR each
 * formation can be bought individually at its own price (lifetime). One single
 * price for everyone — no local/diaspora split.
 */
export const SUBSCRIPTION_USD = 79;

export const subscription = {
  usd: SUBSCRIPTION_USD,
  htg: toHtg(SUBSCRIPTION_USD),
};

export const subscriptionPerks_ht = [
  'Aksè a tout 9 fòmasyon yo',
  'Nouvo fòmasyon yo enkli otomatikman',
  'Sètifika lè w fini yon fòmasyon',
  'Sipò pèsonalize',
  'Anile lè w vle',
];

export const subscriptionPerks_fr = [
  'Accès aux 9 formations',
  'Nouvelles formations incluses automatiquement',
  'Certificat à la fin de chaque formation',
  'Support personnalisé',
  'Annulable à tout moment',
];
