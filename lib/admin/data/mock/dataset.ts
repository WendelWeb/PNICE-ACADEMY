/**
 * Deterministic mock dataset for the admin dashboard.
 *
 * Seeded RNG → the numbers are STABLE across renders (so totals reconcile and
 * KPIs don't flicker on reload), yet anchored to "now" so the today/7d/30d
 * windows stay meaningful. Pricing is pulled from the real catalog
 * (data/courses.ts) and the real subscription price (data/pricing.ts) so the
 * revenue figures match the actual business model.
 *
 * Replaced by Drizzle queries in a later lot — see lib/admin/data/index.ts.
 */
import { courses } from '@/data/courses';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import type {
  AdminUser,
  AdminPayment,
  AdminSubscription,
  AdminEnrollment,
  AdminCertificate,
  AdminCourseStat,
  Country,
  PaymentMethod,
} from '../types';

export type MockDataset = {
  users: AdminUser[];
  payments: AdminPayment[];
  subscriptions: AdminSubscription[];
  enrollments: AdminEnrollment[];
  certificates: AdminCertificate[];
  courseStats: AdminCourseStat[];
  /** Reference "now" the windows are computed against (ISO). */
  referenceNow: string;
};

/* ----------------------------- seeded RNG -------------------------------- */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------- name banks -------------------------------- */
const FIRST = [
  'Jean', 'Marie', 'Pierre', 'Wideline', 'Jameson', 'Nadège', 'Ricardo', 'Fabiola',
  'Schneider', 'Manoucheka', 'Wisly', 'Darline', 'Kervens', 'Mirlande', 'Junior',
  'Stephanie', 'Woodley', 'Guerline', 'Emmanuel', 'Rose', 'Carl', 'Lovely',
  'Frantz', 'Bethsaïda', 'Daniel', 'Sandra', 'Berthony', 'Esther', 'Ronald', 'Naïka',
];
const LAST = [
  'Pierre', 'Joseph', 'Charles', 'Louis', 'Jean-Baptiste', 'Étienne', 'Désir',
  'Augustin', 'Saint-Louis', 'Cadet', 'Dorvil', 'Fils-Aimé', 'Toussaint', 'Moïse',
  'Innocent', 'Cherenfant', 'Bélizaire', 'Noël', 'Estimé', 'Lafontant',
];
const CITIES_HT = [
  'Port-au-Prince', 'Cap-Haïtien', 'Gonaïves', 'Les Cayes', 'Jacmel',
  'Pétion-Ville', 'Delmas', 'Carrefour', 'Croix-des-Bouquets', 'Saint-Marc',
];
const CITIES_DIASPORA = [
  'Miami', 'Brooklyn', 'Montréal', 'Boston', 'Orlando', 'Paris',
  'Atlanta', 'Newark', 'Tampa', 'Santiago',
];
const METHODS: PaymentMethod[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];
/** Recurring billing is card/PayPal only (MonCash/NatCash can't auto-renew). */
const RECURRING_METHODS: PaymentMethod[] = ['card', 'paypal'];

const DAY = 86_400_000;
const SUBSCRIPTION_CENTS = SUBSCRIPTION_USD * 100;

let cached: MockDataset | null = null;

export function getMockDataset(): MockDataset {
  if (cached) return cached;

  const rng = mulberry32(0x9_a55); // fixed seed → reproducible
  const rand = () => rng();
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const chance = (p: number) => rand() < p;

  const now = Date.now();
  const referenceNow = new Date(now).toISOString();
  const iso = (ms: number) => new Date(ms).toISOString();

  const users: AdminUser[] = [];
  const payments: AdminPayment[] = [];
  const subscriptions: AdminSubscription[] = [];
  const enrollments: AdminEnrollment[] = [];
  const certificates: AdminCertificate[] = [];

  let pSeq = 0;
  const nextPaymentId = () => `pay_${(++pSeq).toString().padStart(5, '0')}`;

  const USER_COUNT = 264;

  for (let i = 0; i < USER_COUNT; i++) {
    const id = `usr_${(i + 1).toString().padStart(4, '0')}`;
    const country: Country = chance(0.55) ? 'HT' : 'diaspora';
    const city = country === 'HT' ? pick(CITIES_HT) : pick(CITIES_DIASPORA);
    const first = pick(FIRST);
    const last = pick(LAST);
    const name = `${first} ${last}`;
    const email = `${first}.${last}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]/g, '') + `${randInt(1, 99)}@gmail.com`;

    // Growth curve: bias signups toward recent (sqrt skews offset toward 0).
    const signupOffsetDays = Math.floor((1 - Math.sqrt(rand())) * 430);
    const createdMs = now - signupOffsetDays * DAY;
    const createdAt = iso(createdMs);

    // Acquisition tier.
    const r = rand();
    const isSubscriber = r < 0.16;
    const isBuyer = !isSubscriber && r < 0.42; // ~26%
    // else: registered-only (~58%)

    let coursesOwned = 0;
    let lastActiveAt: string | null = null;

    if (isSubscriber) {
      coursesOwned = courses.length;
      // status: 72% active, 22% canceled, 6% past_due
      const sr = rand();
      const status = sr < 0.72 ? 'active' : sr < 0.94 ? 'canceled' : 'past_due';
      const startedMs = createdMs + randInt(0, 3) * DAY;
      const canceledMs =
        status === 'canceled'
          ? Math.min(now, startedMs + randInt(1, 10) * 30 * DAY)
          : null;
      subscriptions.push({
        id: `sub_${id}`,
        userId: id,
        status,
        startedAt: iso(startedMs),
        canceledAt: canceledMs ? iso(canceledMs) : null,
        amountCents: SUBSCRIPTION_CENTS,
      });

      // Monthly recurring charges from start until cancel / past_due / now.
      const endMs = canceledMs ?? now;
      const method = pick(RECURRING_METHODS);
      for (let m = startedMs; m <= endMs; m += 30 * DAY) {
        const isLastCharge = m + 30 * DAY > endMs;
        const failed = status === 'past_due' && isLastCharge;
        payments.push({
          id: nextPaymentId(),
          userId: id,
          productType: 'subscription',
          courseSlug: null,
          method,
          status: failed ? 'failed' : 'succeeded',
          amountCents: SUBSCRIPTION_CENTS,
          currency: 'USD',
          createdAt: iso(m),
        });
      }

      // Subscribers enroll into a subset of courses, spread across their
      // lifetime (start → now) — spread proportionally so we never generate a
      // future date that would otherwise pile onto "today".
      const nCourses = randInt(2, 7);
      const chosen = [...courses].sort(() => rand() - 0.5).slice(0, nCourses);
      for (const c of chosen) {
        const enrolledMs = startedMs + Math.floor(rand() * Math.max(0, now - startedMs));
        enrollments.push({ userId: id, courseSlug: c.slug, enrolledAt: iso(enrolledMs) });
        if (chance(0.45)) {
          const activeMs = enrolledMs + Math.floor(rand() * Math.max(0, now - enrolledMs));
          if (!lastActiveAt || activeMs > Date.parse(lastActiveAt)) lastActiveAt = iso(activeMs);
        }
        if (chance(0.3)) {
          certificates.push({
            id: `cert_${id}_${c.slug}`,
            userId: id,
            courseSlug: c.slug,
            issuedAt: iso(enrolledMs + Math.floor(rand() * Math.max(0, now - enrolledMs))),
          });
        }
      }
    } else if (isBuyer) {
      const nCourses = randInt(1, 4);
      const chosen = [...courses].sort(() => rand() - 0.5).slice(0, nCourses);
      for (const c of chosen) {
        // Purchase date spread between signup and now (no future clamping).
        const buyMs = createdMs + Math.floor(rand() * Math.max(0, now - createdMs));
        // 90% succeeded, 6% failed, 4% refunded.
        const sr = rand();
        const status = sr < 0.9 ? 'succeeded' : sr < 0.96 ? 'failed' : 'refunded';
        payments.push({
          id: nextPaymentId(),
          userId: id,
          productType: 'course',
          courseSlug: c.slug,
          method: pick(METHODS),
          status,
          amountCents: c.priceUsd * 100,
          currency: 'USD',
          createdAt: iso(buyMs),
        });
        if (status === 'succeeded') {
          coursesOwned++;
          enrollments.push({ userId: id, courseSlug: c.slug, enrolledAt: iso(buyMs) });
          if (chance(0.5)) {
            const activeMs = buyMs + Math.floor(rand() * Math.max(0, now - buyMs));
            if (!lastActiveAt || activeMs > Date.parse(lastActiveAt)) lastActiveAt = iso(activeMs);
          }
          if (chance(0.25)) {
            certificates.push({
              id: `cert_${id}_${c.slug}`,
              userId: id,
              courseSlug: c.slug,
              issuedAt: iso(buyMs + Math.floor(rand() * Math.max(0, now - buyMs))),
            });
          }
        }
      }
    }

    users.push({
      id,
      name,
      email,
      country,
      city,
      createdAt,
      coursesOwned,
      isSubscriber,
      lastActiveAt,
    });
  }

  // Per-course aggregate stats.
  const courseStats: AdminCourseStat[] = courses.map((c) => {
    const courseEnrollments = enrollments.filter((e) => e.courseSlug === c.slug).length;
    const revenueCents = payments
      .filter((p) => p.courseSlug === c.slug && p.status === 'succeeded')
      .reduce((s, p) => s + p.amountCents, 0);
    const completions = certificates.filter((ct) => ct.courseSlug === c.slug).length;
    return {
      slug: c.slug,
      code: c.code,
      title_fr: c.title_fr,
      title_ht: c.title_ht,
      priceUsdCents: c.priceUsd * 100,
      enrollments: courseEnrollments,
      revenueCents,
      completions,
    };
  });

  cached = {
    users,
    payments,
    subscriptions,
    enrollments,
    certificates,
    courseStats,
    referenceNow,
  };
  return cached;
}
