/**
 * Deterministic mock dataset for the admin dashboard.
 *
 * Seeded RNG → the numbers are STABLE across renders (so totals reconcile and
 * KPIs don't flicker on reload), yet anchored to "now" so the today/7d/30d
 * windows stay meaningful. Pricing is pulled from the real catalog
 * (data/courses.ts) and the real subscription price (data/pricing.ts) so the
 * revenue figures match the actual business model.
 *
 * The returned object is a MUTABLE singleton: manual admin actions
 * (lib/admin/data/mock) push to its arrays so changes persist for the life of
 * the server process. Replaced by Drizzle queries later — see
 * lib/admin/data/index.ts.
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
  AdminProgress,
  CreditEntry,
  AuditEntry,
  Country,
  Locale,
  PaymentMethod,
  UserStatus,
  PromoCode,
  PromoRedemption,
  CheckoutSession,
  Referral,
  UserAcquisition,
  SupportTicket,
  SupportReply,
  SupportTemplate,
  AdminNotification,
  WebhookLog,
  ErrorLog,
  SupportSettings,
} from '../types';

export type MockDataset = {
  users: AdminUser[];
  payments: AdminPayment[];
  subscriptions: AdminSubscription[];
  enrollments: AdminEnrollment[];
  certificates: AdminCertificate[];
  progress: AdminProgress[];
  creditLedger: CreditEntry[];
  auditLog: AuditEntry[];
  courseStats: AdminCourseStat[];
  /* Marketing & acquisition (Phase D Lot 1) */
  promoCodes: PromoCode[];
  redemptions: PromoRedemption[];
  checkoutSessions: CheckoutSession[];
  referrals: Referral[];
  acquisition: UserAcquisition[];
  /** Credit (USD cents) granted to a referrer per confirmed filleul. Mutable. */
  referralCreditCents: number;
  /* Support & système (Phase D Lot 2) */
  tickets: SupportTicket[];
  ticketReplies: SupportReply[];
  templates: SupportTemplate[];
  notifications: AdminNotification[];
  webhookLogs: WebhookLog[];
  errorLogs: ErrorLog[];
  supportSettings: SupportSettings;
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
/** Subscription providers (weighted). card/PayPal auto-renew; MonCash/NatCash/Crypto are manual. */
const SUB_PROVIDERS: PaymentMethod[] = [
  'card', 'card', 'card', 'paypal', 'paypal', 'moncash', 'natcash', 'crypto',
];
const CANCEL_REASONS = [
  'too_expensive', 'not_enough_time', 'finished_courses',
  'technical_issues', 'found_alternative', 'other',
];

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
  const digits = (n: number) =>
    Array.from({ length: n }, () => randInt(0, 9)).join('');

  const now = Date.now();
  const referenceNow = new Date(now).toISOString();
  const iso = (ms: number) => new Date(ms).toISOString();

  const users: AdminUser[] = [];
  const payments: AdminPayment[] = [];
  const subscriptions: AdminSubscription[] = [];
  const enrollments: AdminEnrollment[] = [];
  const certificates: AdminCertificate[] = [];
  const progress: AdminProgress[] = [];
  const creditLedger: CreditEntry[] = [];

  let pSeq = 0;
  const nextPaymentId = () => `pay_${(++pSeq).toString().padStart(5, '0')}`;
  let cSeq = 0;
  const nextCreditId = () => `cred_${(++cSeq).toString().padStart(5, '0')}`;
  const verifCode = () =>
    `PNA-${digits(4)}-${String.fromCharCode(65 + randInt(0, 25))}${randInt(10, 99)}`;

  function phoneFor(country: Country, city: string): string {
    if (country === 'HT') return `+509 ${randInt(2, 4)}${digits(3)} ${digits(4)}`;
    if (city === 'Paris') return `+33 ${digits(1)} ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`;
    if (city === 'Montréal') return `+1 ${randInt(200, 999)} ${digits(3)} ${digits(4)}`;
    if (city === 'Santiago') return `+1 809 ${digits(3)} ${digits(4)}`;
    return `+1 ${randInt(200, 999)} ${digits(3)} ${digits(4)}`;
  }

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
    const phone = phoneFor(country, city);
    const language: Locale =
      country === 'HT' ? (chance(0.75) ? 'ht' : 'fr') : chance(0.5) ? 'ht' : 'fr';
    // A few non-active accounts so the status column/filters have content.
    const status: UserStatus = chance(0.018) ? 'suspended' : chance(0.01) ? 'banned' : 'active';

    // Growth curve: bias signups toward recent (sqrt skews offset toward 0).
    const signupOffsetDays = Math.floor((1 - Math.sqrt(rand())) * 430);
    const createdMs = now - signupOffsetDays * DAY;
    const createdAt = iso(createdMs);

    // Acquisition tier.
    const r = rand();
    const isSubscriber = r < 0.2;
    const isBuyer = !isSubscriber && r < 0.44; // ~24%
    // else: registered-only (~56%)

    let coursesOwned = 0;
    let lastActiveAt: string | null = null;

    const addProgress = (slug: string, total: number, completed: boolean, baseMs: number) => {
      const lessonsDone = completed ? total : randInt(0, total);
      const lastMs = baseMs + Math.floor(rand() * Math.max(0, now - baseMs));
      progress.push({
        userId: id,
        courseSlug: slug,
        lessonsDone,
        lessonsTotal: total,
        lastActivityAt: iso(lastMs),
      });
      if (lessonsDone > 0 && (!lastActiveAt || lastMs > Date.parse(lastActiveAt))) {
        lastActiveAt = iso(lastMs);
      }
    };

    if (isSubscriber) {
      coursesOwned = courses.length;
      const sr = rand();
      const status2 = sr < 0.68 ? 'active' : sr < 0.85 ? 'canceled' : 'past_due';
      const provider = pick(SUB_PROVIDERS);
      const startedMs = createdMs + randInt(0, 3) * DAY;
      const canceledMs =
        status2 === 'canceled'
          ? Math.min(now, startedMs + randInt(1, 10) * 30 * DAY)
          : null;

      // Monthly recurring charges from start until cancel / past_due / now.
      const endMs = canceledMs ?? now;
      let lastChargeMs = startedMs;
      let firstFailedMs: number | null = null;
      for (let m = startedMs; m <= endMs; m += 30 * DAY) {
        lastChargeMs = m;
        const isLastCharge = m + 30 * DAY > endMs;
        const failed = status2 === 'past_due' && isLastCharge;
        if (failed && firstFailedMs === null) firstFailedMs = m;
        payments.push({
          id: nextPaymentId(),
          userId: id,
          productType: 'subscription',
          courseSlug: null,
          method: provider,
          status: failed ? 'failed' : 'succeeded',
          amountCents: SUBSCRIPTION_CENTS,
          currency: 'USD',
          createdAt: iso(m),
        });
      }

      subscriptions.push({
        id: `sub_${id}`,
        userId: id,
        status: status2,
        startedAt: iso(startedMs),
        canceledAt: canceledMs ? iso(canceledMs) : null,
        amountCents: SUBSCRIPTION_CENTS,
        provider,
        currentPeriodEnd: canceledMs ? iso(canceledMs) : iso(lastChargeMs + 30 * DAY),
        cancellationReason: status2 === 'canceled' ? pick(CANCEL_REASONS) : null,
        dunningAttempts: status2 === 'past_due' ? randInt(0, 3) : undefined,
        firstFailedAt: firstFailedMs ? iso(firstFailedMs) : undefined,
      });

      // Subscribers enroll into a subset of courses, spread across their lifetime.
      const nCourses = randInt(2, 7);
      const chosen = [...courses].sort(() => rand() - 0.5).slice(0, nCourses);
      for (const c of chosen) {
        const enrolledMs = startedMs + Math.floor(rand() * Math.max(0, now - startedMs));
        enrollments.push({
          userId: id,
          courseSlug: c.slug,
          enrolledAt: iso(enrolledMs),
          source: 'subscription',
        });
        const completed = chance(0.3);
        addProgress(c.slug, c.lessons.length, completed, enrolledMs);
        if (completed) {
          certificates.push({
            id: `cert_${id}_${c.slug}`,
            userId: id,
            courseSlug: c.slug,
            issuedAt: iso(enrolledMs + Math.floor(rand() * Math.max(0, now - enrolledMs))),
            verificationCode: verifCode(),
          });
        }
      }
    } else if (isBuyer) {
      const nCourses = randInt(1, 4);
      const chosen = [...courses].sort(() => rand() - 0.5).slice(0, nCourses);
      for (const c of chosen) {
        // 85% succeeded, 6% pending, 5% failed, 4% refunded.
        const sr = rand();
        const status3 =
          sr < 0.85 ? 'succeeded' : sr < 0.91 ? 'pending' : sr < 0.96 ? 'failed' : 'refunded';
        // Pending charges are recent (0–6 days) so the >24h "stale" flag is meaningful.
        const buyMs =
          status3 === 'pending'
            ? now - Math.floor(rand() * 6 * DAY)
            : createdMs + Math.floor(rand() * Math.max(0, now - createdMs));
        payments.push({
          id: nextPaymentId(),
          userId: id,
          productType: 'course',
          courseSlug: c.slug,
          method: pick(METHODS),
          status: status3,
          amountCents: c.priceUsd * 100,
          currency: 'USD',
          createdAt: iso(buyMs),
          isRefund: status3 === 'refunded' ? true : undefined,
        });
        if (status3 === 'refunded') {
          creditLedger.push({
            id: nextCreditId(),
            userId: id,
            amountCents: c.priceUsd * 100,
            reason: 'refund_credit',
            createdAt: iso(buyMs + DAY),
          });
        }
        if (status3 === 'succeeded') {
          coursesOwned++;
          enrollments.push({
            userId: id,
            courseSlug: c.slug,
            enrolledAt: iso(buyMs),
            source: 'purchase',
          });
          const completed = chance(0.25);
          addProgress(c.slug, c.lessons.length, completed, buyMs);
          if (completed) {
            certificates.push({
              id: `cert_${id}_${c.slug}`,
              userId: id,
              courseSlug: c.slug,
              issuedAt: iso(buyMs + Math.floor(rand() * Math.max(0, now - buyMs))),
              verificationCode: verifCode(),
            });
          }
        }
      }
    }

    // Occasional referral bonus credit.
    if (chance(0.06)) {
      creditLedger.push({
        id: nextCreditId(),
        userId: id,
        amountCents: 500,
        reason: 'referral_bonus',
        createdAt: iso(createdMs + randInt(1, 60) * DAY),
      });
    }

    users.push({
      id,
      name,
      email,
      phone,
      country,
      city,
      language,
      certificateName: name,
      createdAt,
      coursesOwned,
      isSubscriber,
      status,
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
      lessonsCount: c.lessons.length,
      published: true,
    };
  });

  /* ---------------- Marketing & acquisition (Phase D Lot 1) ---------------- */
  // Isolated RNG: the marketing seed runs AFTER the core dataset is fully built,
  // on its own stream, so iterating on it can never perturb the numbers above.
  const mrng = mulberry32(0xd1a5e);
  const mr = () => mrng();
  const mInt = (min: number, max: number) => Math.floor(mr() * (max - min + 1)) + min;
  const mPick = <T>(arr: T[]): T => arr[Math.floor(mr() * arr.length)];
  const mChance = (p: number) => mr() < p;
  const mShuffle = <T>(arr: T[]): T[] => [...arr].sort(() => mr() - 0.5);
  const HOUR = 3_600_000;
  const MIN = 60_000;

  const referralCreditCents = 500; // $5 per confirmed filleul (Task 9 default)

  // ---- Promo codes (Tasks 1–4) ----
  const courseSlugA = courses[0]?.slug ?? null;
  const expiresIn = (days: number) => iso(now + days * DAY);
  type PromoSpec = { def: PromoCode; target: number };
  const specs: PromoSpec[] = [
    { target: 48, def: pc('BIENVENI20', 'percent', 20, 'all', null, 200, expiresIn(45), null, true) },
    { target: 76, def: pc('LAGAN10', 'fixed', 1000, 'all', null, null, null, null, true) },
    { target: 22, def: pc('SIPOT15', 'percent', 15, 'subscription', null, 100, expiresIn(30), null, true) },
    { target: 15, def: pc('DYASPORA25', 'percent', 25, 'all', null, 15, expiresIn(20), null, true) }, // depleted
    { target: 110, def: pc('NWEL30', 'percent', 30, 'all', null, 300, iso(now - 10 * DAY), null, true) }, // expired
    { target: 0, def: pc('TEST5OFF', 'fixed', 500, 'all', null, null, null, null, false) }, // disabled + deletable
    { target: 12, def: pc('PARE50', 'percent', 50, 'course', courseSlugA, 40, expiresIn(60), null, true) },
    { target: 0, def: pc('NOUVO10', 'percent', 10, 'all', null, 100, null, null, true) }, // active, never used → deletable
    { target: 0, def: pc('ETE2026', 'percent', 20, 'all', null, 150, expiresIn(120), expiresIn(14), true) }, // scheduled
  ];
  const promoCodes: PromoCode[] = specs.map((s) => s.def);

  const succeeded = payments.filter((p) => p.status === 'succeeded');
  const poolFor = (c: PromoCode): AdminPayment[] => {
    if (c.appliesTo === 'subscription') return succeeded.filter((p) => p.productType === 'subscription');
    if (c.appliesTo === 'course') {
      const sub = succeeded.filter((p) => p.productType === 'course');
      return c.courseSlug ? sub.filter((p) => p.courseSlug === c.courseSlug) : sub;
    }
    return succeeded;
  };
  const discountOf = (c: PromoCode, gross: number) =>
    c.discountType === 'percent' ? Math.round((gross * c.discountValue) / 100) : Math.min(c.discountValue, gross);

  const redemptions: PromoRedemption[] = [];
  let rSeq = 0;
  for (const { def, target } of specs) {
    if (target <= 0) continue;
    const chosen = mShuffle(poolFor(def)).slice(0, target);
    for (const pay of chosen) {
      const gross = pay.amountCents;
      const discount = discountOf(def, gross);
      redemptions.push({
        id: `redm_${(++rSeq).toString().padStart(5, '0')}`,
        promoCodeId: def.id,
        userId: pay.userId,
        paymentId: pay.id,
        productType: pay.productType,
        courseSlug: pay.courseSlug,
        grossCents: gross,
        discountCents: discount,
        netCents: gross - discount,
        redeemedAt: pay.createdAt,
      });
    }
    def.usedCount = chosen.length;
  }

  // ---- UTM first-touch attribution (Task 5) ----
  const UTM_DEFS: { source: string; medium: string; campaigns: string[] }[] = [
    { source: 'google', medium: 'cpc', campaigns: ['lansman-2026', 'biznis-promo', 'search-brand'] },
    { source: 'facebook', medium: 'social', campaigns: ['diaspora-fb', 'retargeting', 'lansman-2026'] },
    { source: 'instagram', medium: 'social', campaigns: ['reels-biznis', 'diaspora-fb'] },
    { source: 'whatsapp', medium: 'referral', campaigns: ['wha-partaj'] },
    { source: 'tiktok', medium: 'social', campaigns: ['kreyol-tiktok'] },
    { source: 'youtube', medium: 'video', campaigns: ['kreyol-yt'] },
    { source: 'email', medium: 'email', campaigns: ['newsletter-jen', 'reaktivasyon'] },
    { source: 'referral', medium: 'referral', campaigns: ['pwogram-parenaj'] },
  ];
  const acquisition: UserAcquisition[] = [];
  for (const u of users) {
    if (!mChance(0.72)) continue; // ~28% direct / unknown
    const d = mPick(UTM_DEFS);
    acquisition.push({
      userId: u.id,
      utmSource: d.source,
      utmMedium: d.medium,
      utmCampaign: mPick(d.campaigns),
      capturedAt: u.createdAt,
    });
  }

  // ---- Referral programme (Tasks 8–9) ----
  const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const refCode = () => 'PNICE-' + Array.from({ length: 4 }, () => ALNUM[mInt(0, ALNUM.length - 1)]).join('');
  const referrals: Referral[] = [];
  let refSeq = 0;
  let refCredSeq = 0;
  for (const referrer of mShuffle(users).slice(0, 26)) {
    const code = refCode();
    const invited = mInt(1, 6);
    for (let k = 0; k < invited; k++) {
      const confirmed = mChance(0.5);
      const createdMs = now - mInt(5, 120) * DAY;
      let referredUserId: string | null = null;
      let confirmedAt: string | null = null;
      if (confirmed) {
        const cand = mPick(users);
        referredUserId = cand.id === referrer.id ? null : cand.id;
        confirmedAt = iso(Math.min(now, createdMs + mInt(1, 20) * DAY));
        creditLedger.push({
          id: `cred_ref_${(++refCredSeq).toString().padStart(4, '0')}`,
          userId: referrer.id,
          amountCents: referralCreditCents,
          reason: 'referral',
          createdAt: confirmedAt,
        });
      } else if (mChance(0.5)) {
        const cand = mPick(users);
        referredUserId = cand.id === referrer.id ? null : cand.id;
      }
      referrals.push({
        id: `ref_${(++refSeq).toString().padStart(4, '0')}`,
        referrerUserId: referrer.id,
        referredUserId,
        referralCode: code,
        status: confirmed ? 'confirmed' : 'pending',
        createdAt: iso(createdMs),
        confirmedAt,
      });
    }
  }

  // ---- Checkout sessions / abandoned carts (Tasks 6–7) ----
  const checkoutSessions: CheckoutSession[] = [];
  let csSeq = 0;
  const pickProduct = (): { productType: 'course' | 'subscription'; courseSlug: string | null; amountCents: number } => {
    if (mChance(0.45)) {
      const c = mPick(courses);
      return { productType: 'course', courseSlug: c.slug, amountCents: c.priceUsd * 100 };
    }
    return { productType: 'subscription', courseSlug: null, amountCents: SUBSCRIPTION_CENTS };
  };
  const pushSession = (
    userId: string | null,
    sessionId: string | null,
    startedMs: number,
    o: { abandonedMs?: number | null; remindedMs?: number | null; completedMs?: number | null },
  ) => {
    const p = pickProduct();
    checkoutSessions.push({
      id: `cs_${(++csSeq).toString().padStart(4, '0')}`,
      userId,
      sessionId,
      productType: p.productType,
      courseSlug: p.courseSlug,
      amountCents: p.amountCents,
      startedAt: iso(startedMs),
      completedAt: o.completedMs ? iso(o.completedMs) : null,
      abandonedAt: o.abandonedMs ? iso(o.abandonedMs) : null,
      remindedAt: o.remindedMs ? iso(o.remindedMs) : null,
    });
  };
  const randUserId = () => mPick(users).id;
  // 10 abandoned, never reminded
  for (let i = 0; i < 10; i++) {
    const start = now - mInt(2, 28) * DAY - mInt(0, 23) * HOUR;
    pushSession(randUserId(), null, start, { abandonedMs: start + mInt(2, 6) * HOUR });
  }
  // 6 abandoned + reminded (not converted)
  for (let i = 0; i < 6; i++) {
    const start = now - mInt(4, 30) * DAY;
    const ab = start + mInt(2, 6) * HOUR;
    pushSession(randUserId(), null, start, { abandonedMs: ab, remindedMs: ab + mInt(1, 3) * DAY });
  }
  // 5 abandoned + reminded + converted
  for (let i = 0; i < 5; i++) {
    const start = now - mInt(6, 34) * DAY;
    const ab = start + mInt(2, 6) * HOUR;
    const rem = ab + mInt(1, 3) * DAY;
    pushSession(randUserId(), null, start, { abandonedMs: ab, remindedMs: rem, completedMs: rem + mInt(2, 30) * HOUR });
  }
  // 4 guest abandoned (no email → no relance possible)
  for (let i = 0; i < 4; i++) {
    const start = now - mInt(1, 20) * DAY;
    pushSession(null, `sess_${(1000 + i).toString()}`, start, { abandonedMs: start + mInt(2, 5) * HOUR });
  }
  // 4 still-open (started < 2h ago) → targets for the manual "mark abandoned" sim
  for (let i = 0; i < 4; i++) {
    pushSession(randUserId(), null, now - mInt(5, 110) * MIN, {});
  }

  /* ---------------- Support & système (Phase D Lot 2) ---------------- */
  const srng = mulberry32(0x5a99f); // isolated stream
  const sr = () => srng();
  const sInt = (a: number, b: number) => Math.floor(sr() * (b - a + 1)) + a;
  const sPick = <T>(arr: T[]): T => arr[Math.floor(sr() * arr.length)];
  const sChance = (p: number) => sr() < p;

  const succByUser = new Map<string, AdminPayment>();
  for (const p of succeeded) if (!succByUser.has(p.userId)) succByUser.set(p.userId, p);
  const refundCandidates = [...succByUser.keys()];
  const coursePricesCents = courses.map((c) => c.priceUsd * 100);

  const SUBJECTS: Record<string, string[]> = {
    question: ['Kijan pou m jwenn fòmasyon m apre peman?', 'Mwen pa ka konekte sou kont mwen', 'Èske gen sètifika apre fòmasyon an?', 'Kijan pou m chanje lang lan?'],
    bug: ['Videyo a pa chaje', 'Bouton an pa reponn sou telefòn mwen', 'Pwogrè leson m disparèt', 'Paj la rete blan'],
    refund: ['Mwen peye de fwa pa erè', 'Mwen vle ranbousman fòmasyon an', 'Peman an pa ban m aksè'],
  };
  const MESSAGES: Record<string, string[]> = {
    question: ['Bonjou, mwen sot peye men mwen pa wè fòmasyon an nan kont mwen. Èd souple.', 'Mwen bliye modpas mwen epi imel reyinisyalizasyon an pa rive.', 'Mwen ta renmen konnen si gen yon sètifika ofisyèl.'],
    bug: ['Lè m klike sou leson 3 videyo a ap chaje san rete. Mwen sou Chrome Android.', 'Sou iPhone bouton "kontinye" a pa fè anyen.', 'Mwen te fini 5 leson men li montre 0 kounye a.'],
    refund: ['Kat mwen te chaje de fwa pou menm fòmasyon an, mwen bezwen yon ranbousman.', 'Fòmasyon an pa sa m te panse, mwen mande ranbousman nan 7 jou yo.'],
  };
  const ADMIN_REPLIES = ['Bonjou, mèsi pou mesaj ou. Nou ap gade sa epi n ap reponn ou byen vit.', 'Nou rezoud pwoblèm nan, tcheke kont ou ankò souple.', 'Nou voye yon nouvo lyen ba ou pa imel.'];
  const USER_REPLIES = ['Mèsi anpil, mwen ap eseye.', 'Sa toujou pa mache pou mwen.', 'Pafè, li mache kounye a !'];

  const tickets: SupportTicket[] = [];
  const ticketReplies: SupportReply[] = [];
  let tSeq = 0;
  let trSeq = 0;
  for (let i = 0; i < 28; i++) {
    const type = sChance(0.5) ? 'question' : sChance(0.6) ? 'bug' : 'refund';
    let user: AdminUser;
    let relatedPaymentId: string | null = null;
    if (type === 'refund' && refundCandidates.length) {
      const uid = sPick(refundCandidates);
      user = users.find((u) => u.id === uid)!;
      relatedPaymentId = succByUser.get(uid)!.id;
    } else {
      user = sPick(users);
    }
    const createdMs = now - sInt(0, 45) * DAY - sInt(0, 23) * HOUR;
    const status = sChance(0.35) ? 'open' : sChance(0.45) ? 'in_progress' : 'resolved';
    const assigned = status !== 'open';
    const id = `tic_${(++tSeq).toString().padStart(4, '0')}`;
    let updatedMs = createdMs;
    if (assigned) {
      let last = createdMs;
      const n = sInt(1, 3);
      for (let k = 0; k < n; k++) {
        last = Math.min(now - sInt(1, 5) * HOUR, last + sInt(1, 40) * HOUR);
        const adminTurn = k % 2 === 0;
        ticketReplies.push({
          id: `trep_${(++trSeq).toString().padStart(4, '0')}`,
          ticketId: id,
          authorType: adminTurn ? 'admin' : 'user',
          authorId: adminTurn ? 'seed_admin' : user.id,
          authorName: adminTurn ? 'Support PNICE' : user.name,
          body: adminTurn ? sPick(ADMIN_REPLIES) : sPick(USER_REPLIES),
          createdAt: iso(last),
        });
        updatedMs = last;
      }
    }
    tickets.push({
      id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      type,
      subject: sPick(SUBJECTS[type]),
      message: sPick(MESSAGES[type]),
      status,
      assignedAdminId: assigned ? 'seed_admin' : null,
      assignedAdminName: assigned ? 'Support PNICE' : null,
      relatedPaymentId,
      createdAt: iso(createdMs),
      updatedAt: iso(updatedMs),
    });
  }

  const templates: SupportTemplate[] = [
    { id: 'tpl_1', category: 'compte', title_ht: 'Reyinisyalize modpas', title_fr: 'Réinitialiser le mot de passe', body_ht: 'Bonjou, pou reyinisyalize modpas ou, ale sou paj koneksyon an epi klike “Bliye modpas”. W ap resevwa yon imel ak yon lyen.', body_fr: 'Bonjour, pour réinitialiser votre mot de passe, allez sur la page de connexion et cliquez sur « Mot de passe oublié ». Vous recevrez un email avec un lien.', createdAt: referenceNow },
    { id: 'tpl_2', category: 'paiement', title_ht: 'Resi pa rive', title_fr: "Je n'ai pas reçu mon reçu", body_ht: 'Nou voye resi ou ankò pa imel. Tcheke katye spam ou tou. Si li toujou pa rive, fè nou konnen.', body_fr: "Nous vous avons renvoyé votre reçu par email. Vérifiez aussi vos spams. S'il n'arrive toujours pas, dites-le-nous.", createdAt: referenceNow },
    { id: 'tpl_3', category: 'formation', title_ht: 'Aksè apre peman', title_fr: 'Accéder à ma formation après paiement', body_ht: 'Apre peman an, fòmasyon ou parèt nan “Mon kont → Mes formations”. Si li pa la, n ap ajoute aksè a manyèlman pou ou.', body_fr: 'Après le paiement, votre formation apparaît dans « Mon kont → Mes formations ». Si elle n’y est pas, nous vous ajoutons l’accès manuellement.', createdAt: referenceNow },
    { id: 'tpl_4', category: 'paiement', title_ht: 'MonCash pa fini', title_fr: 'Paiement MonCash non finalisé', body_ht: 'Peman MonCash ou pa t fini. Eseye ankò oswa itilize yon lòt metòd. Si lajan an retire, voye referans transaksyon an ban nou.', body_fr: 'Votre paiement MonCash n’a pas abouti. Réessayez ou utilisez un autre moyen. Si la somme a été débitée, envoyez-nous la référence de transaction.', createdAt: referenceNow },
    { id: 'tpl_5', category: 'formation', title_ht: 'Videyo pa chaje', title_fr: 'La vidéo ne charge pas', body_ht: 'Eseye rafrechi paj la epi tcheke koneksyon entènèt ou. Si pwoblèm nan kontinye, di nou ki aparèy ak navigatè w ap itilize.', body_fr: 'Essayez de rafraîchir la page et vérifiez votre connexion. Si le problème persiste, indiquez-nous votre appareil et votre navigateur.', createdAt: referenceNow },
    { id: 'tpl_6', category: 'compte', title_ht: 'Chanje lang', title_fr: 'Changer de langue', body_ht: 'Ou ka chanje lang lan (Kreyòl/Français) nan meni anlè a oswa nan “Mon kont → Préférences”.', body_fr: 'Vous pouvez changer de langue (Kreyòl/Français) depuis le menu en haut ou dans « Mon kont → Préférences ».', createdAt: referenceNow },
  ];

  const notifications: AdminNotification[] = [];
  let nSeq = 0;
  const mkNotif = (kind: AdminNotification['kind'], severity: AdminNotification['severity'], user: AdminUser | null, amountCents: number | null, detail: string, agoMs: number, read: boolean) => {
    notifications.push({ id: `ntf_${(++nSeq).toString().padStart(4, '0')}`, kind, severity, userId: user?.id ?? null, userName: user?.name ?? null, amountCents, detail, createdAt: iso(now - agoMs), read });
  };
  for (let i = 0; i < 10; i++) mkNotif('sale', 'info', sPick(users), sChance(0.4) ? SUBSCRIPTION_CENTS : sPick(coursePricesCents), sChance(0.4) ? 'Abonnement mensuel' : 'Achat formation', sInt(2, 6000) * MIN, sChance(0.5));
  for (let i = 0; i < 4; i++) mkNotif('payment_failed', 'critical', sPick(users), SUBSCRIPTION_CENTS, 'Échec de paiement abonnement', sInt(10, 4000) * MIN, sChance(0.25));
  for (let i = 0; i < 3; i++) mkNotif('refund_request', 'critical', sPick(users), sPick(coursePricesCents), 'Demande de remboursement', sInt(10, 3000) * MIN, false);
  for (let i = 0; i < 3; i++) mkNotif('sub_canceled', 'info', sPick(users), SUBSCRIPTION_CENTS, 'Abonnement annulé', sInt(60, 6000) * MIN, sChance(0.6));
  mkNotif('webhook_error', 'critical', null, null, 'MonCash · payment.success (échec de traitement)', 130 * MIN, false);

  const WH_ERRORS = ['Timeout: aucune réponse de l’endpoint de confirmation (10s)', 'Signature invalide (HMAC mismatch)', 'Utilisateur introuvable pour la référence fournie', 'Réponse 500 du handler interne'];
  const WH_EVENTS: Record<string, string[]> = {
    card: ['payment_intent.succeeded', 'charge.refunded', 'payment_intent.payment_failed'],
    paypal: ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.DENIED'],
    moncash: ['payment.success', 'payment.failed'],
    natcash: ['payment.success', 'payment.failed'],
    crypto: ['charge:confirmed', 'charge:failed'],
  };
  const WH_PROVIDERS: PaymentMethod[] = ['card', 'paypal', 'moncash', 'natcash', 'crypto'];
  const webhookLogs: WebhookLog[] = [
    // Guaranteed failed >1h old → coherent with the webhook_error notification above.
    { id: 'wh_00001', provider: 'moncash', eventType: 'payment.success', status: 'failed', errorMessage: WH_ERRORS[0], receivedAt: iso(now - 130 * MIN), processedAt: null, retryCount: 1, ref: 'evt_mc_critical' },
  ];
  let wSeq = 1;
  for (let i = 0; i < 40; i++) {
    const provider = sPick(WH_PROVIDERS);
    const recvMs = now - sInt(0, 20) * DAY - sInt(0, 23) * HOUR;
    const failed = sChance(0.12);
    const ignored = !failed && sChance(0.06);
    webhookLogs.push({
      id: `wh_${(++wSeq + 1).toString().padStart(5, '0')}`,
      provider,
      eventType: sPick(WH_EVENTS[provider]),
      status: failed ? 'failed' : ignored ? 'ignored' : 'processed',
      errorMessage: failed ? sPick(WH_ERRORS) : null,
      receivedAt: iso(recvMs),
      processedAt: failed ? null : iso(recvMs + sInt(1, 8) * 1000),
      retryCount: failed ? sInt(0, 2) : 0,
      ref: `evt_${provider}_${(1000 + i).toString()}`,
    });
  }

  const errorLogs: ErrorLog[] = [
    { id: 'err_1', message: 'TypeError: Cannot read properties of undefined (reading "slug")', stackTruncated: 'at CoursePage (app/[locale]/(site)/formations/[slug]/page.tsx:34)\n  at renderWithHooks (react-dom)', route: '/[locale]/formations/[slug]', firstAt: iso(now - 9 * DAY), lastAt: iso(now - 3 * HOUR), count: 312 },
    { id: 'err_2', message: 'Error: Clerk: session token expired', stackTruncated: 'at getAuth (@clerk/nextjs/server)\n  at AccountPage (app/[locale]/(site)/kont/page.tsx:16)', route: '/[locale]/kont', firstAt: iso(now - 14 * DAY), lastAt: iso(now - 1 * DAY), count: 47 },
    { id: 'err_3', message: 'FetchError: request to https://video.bunnycdn.com failed (ETIMEDOUT)', stackTruncated: 'at Bunny.listVideos (lib/admin/health/bunny.ts:21)', route: '/[locale]/admin/sante', firstAt: iso(now - 5 * DAY), lastAt: iso(now - 6 * HOUR), count: 8 },
    { id: 'err_4', message: 'Error: NEXT_NOT_FOUND', stackTruncated: 'at notFound (next/navigation)\n  at TicketPage', route: '/[locale]/admin/support/[ticketId]', firstAt: iso(now - 4 * DAY), lastAt: iso(now - 2 * DAY), count: 5 },
    { id: 'err_5', message: 'RangeError: Maximum call stack size exceeded', stackTruncated: 'at toHtg (lib/money.ts)', route: '/[locale]/checkout', firstAt: iso(now - 2 * DAY), lastAt: iso(now - 20 * HOUR), count: 3 },
  ];

  const supportSettings: SupportSettings = { dailyDigestEnabled: true, dailyDigestHour: 8 };

  cached = {
    users,
    payments,
    subscriptions,
    enrollments,
    certificates,
    progress,
    creditLedger,
    auditLog: [],
    courseStats,
    promoCodes,
    redemptions,
    checkoutSessions,
    referrals,
    acquisition,
    referralCreditCents,
    tickets,
    ticketReplies,
    templates,
    notifications,
    webhookLogs,
    errorLogs,
    supportSettings,
    referenceNow,
  };
  return cached;
}

/** Build a PromoCode definition (usedCount filled later from generated redemptions). */
function pc(
  code: string,
  discountType: PromoCode['discountType'],
  discountValue: number,
  appliesTo: PromoCode['appliesTo'],
  courseSlug: string | null,
  maxUses: number | null,
  expiresAt: string | null,
  startsAt: string | null,
  isActive: boolean,
): PromoCode {
  return {
    id: `promo_${code.toLowerCase()}`,
    code,
    discountType,
    discountValue,
    appliesTo,
    courseSlug,
    maxUses,
    usedCount: 0,
    expiresAt,
    startsAt,
    isActive,
    createdAt: new Date().toISOString(),
  };
}
