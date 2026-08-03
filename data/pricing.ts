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

/**
 * Stage 4 — perks split. The old `subscriptionPerks_*` list opened with
 * « Aksè a tout fòmasyon PNICE Academy yo », which is only true of the
 * PLATFORM pass — rendered on a teacher's own /prof pass block it was a lie
 * (a teacher pass covers only that teacher's catalogue). Two honest lists
 * now exist and every renderer picks the one matching what checkout would
 * actually sell:
 *   - `platformPassPerks_*` — the Pass PNICE (every course, every teacher).
 *   - `teacherPassPerks(name, locale)` — ONE teacher's pass, scoped to
 *     « tout fòmasyon {name} yo » exactly like checkout's own
 *     `subTeacherOnlyNote` scope wording.
 */
export const platformPassPerks_ht = [
  'Aksè a TOUT fòmasyon sou PNICE Academy — chak anseyan',
  'Nouvo fòmasyon yo enkli otomatikman',
  'Sètifika lè w fini yon fòmasyon',
  'Sipò pèsonalize',
  'Anile lè w vle',
];

export const platformPassPerks_fr = [
  'Accès à TOUTES les formations sur PNICE Academy — chaque enseignant',
  'Nouvelles formations incluses automatiquement',
  'Certificat à la fin de chaque formation',
  'Support personnalisé',
  'Annulable à tout moment',
];

/**
 * The honest perk list for ONE teacher's pass — scoped to that teacher's own
 * catalogue, never « tout PNICE Academy ». Pure; kreyòl first, warm register,
 * mirroring the platform list's rhythm.
 */
export function teacherPassPerks(name: string, locale: string): string[] {
  if (locale === 'ht') {
    return [
      `Aksè a tout fòmasyon ${name} yo`,
      'Chak nouvo fòmasyon anseyan sa a enkli otomatikman',
      'Sètifika lè w fini yon fòmasyon',
      'Sipò pèsonalize',
      'Anile lè w vle',
    ];
  }
  return [
    `Accès à toutes les formations de ${name}`,
    'Chaque nouvelle formation de cet enseignant incluse automatiquement',
    'Certificat à la fin de chaque formation',
    'Support personnalisé',
    'Annulable à tout moment',
  ];
}
