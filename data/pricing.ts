/**
 * Money model (marketplace pivot — see
 * docs/superpowers/plans/2026-07-23-marketplace-homepage.md): each teacher
 * sets their own course prices, and ALSO their own `teacher_plans` price for
 * a pass to just their own catalogue. Each formation can also be bought
 * individually at its own price (lifetime). One single price for everyone —
 * no local/diaspora split.
 *
 * UPDATED (Task: two subscription products): `SUBSCRIPTION_USD * 100` is now
 * a FALLBACK CONSTANT in two distinct places, never a live source of truth on
 * its own:
 *   - lib/platformPrice.ts's `getPlatformPassPriceCents` — the owner-set
 *     price of "Pass PNICE" (the genuine all-access pass, every published
 *     course, priced from /admin/prix) falls back to this constant with no
 *     DB/settings row.
 *   - a teacher's own `teacher_plans` row with no `price_cents_monthly` set
 *     (lib/payments/products.ts's `activePlanFor`, lib/teacher/public.ts's
 *     `getActiveTeacherPlan`) also falls back to this constant — unrelated to
 *     the platform pass above, just the same historical default reused for a
 *     not-yet-priced individual plan.
 */
export const SUBSCRIPTION_USD = 79;

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
