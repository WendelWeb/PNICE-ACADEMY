import { toHtg } from '@/lib/money';

/**
 * Money model (marketplace pivot — see
 * docs/superpowers/plans/2026-07-23-marketplace-homepage.md): each teacher
 * sets their own subscription + course prices. $79/month is PNICE Academy's
 * own pass — teacher #1's subscription, unlocking PNICE Academy's own
 * formations — not "the platform subscription". Each formation can also be
 * bought individually at its own price (lifetime). One single price for
 * everyone — no local/diaspora split.
 */
export const SUBSCRIPTION_USD = 79;

export const subscription = {
  usd: SUBSCRIPTION_USD,
  htg: toHtg(SUBSCRIPTION_USD),
};

export const subscriptionPerks_ht = [
  'Aksè a tout fòmasyon PNICE Academy yo',
  'Nouvo fòmasyon yo enkli otomatikman',
  'Sètifika lè w fini yon fòmasyon',
  'Sipò pèsonalize',
  'Anile lè w vle',
];

export const subscriptionPerks_fr = [
  'Accès à toutes les formations PNICE Academy',
  'Nouvelles formations incluses automatiquement',
  'Certificat à la fin de chaque formation',
  'Support personnalisé',
  'Annulable à tout moment',
];
