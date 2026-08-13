/**
 * Real (Drizzle) Analytics domain (Task L2b) — the single `getAnalytics`
 * method backing /admin/analytics. Same "load everything, aggregate in JS"
 * style as ./users.ts / ./subscriptions.ts / ./engagement.ts (loadAll). The
 * mock (`lib/admin/data/mock/index.ts` — buildBuckets/bucketIndex/countryOf +
 * getAnalytics) is the reference for the exact AnalyticsData shape, bucket
 * boundaries, and section-by-section semantics; this file reproduces that
 * behaviour from real rows, bucket-for-bucket.
 *
 * Vocabulary mapping DB → admin UI (consistent with ./users.ts,
 * ./transactions.ts, ./subscriptions.ts):
 *  - payments.status 'completed' → 'succeeded' (only 'completed' rows count
 *    as revenue/paid, exactly like every other real/*.ts file).
 *  - payments.provider 'stripe' → 'card' (rest pass through).
 *  - users.localePref → language ('fr' passes through, anything else → 'ht',
 *    same fallback as ./users.ts's langOf).
 *
 * DOCUMENTED DEGENERACIES (each referenced inline instead of repeated):
 *
 *  1. Funnel "visitors" step — MOCK, unchanged. No traffic-analytics source
 *     exists in the DB (no page-view/session-events table), so this can never
 *     be a real number here any more than in KpiOverview.visitorsThisMonth
 *     (real/users.ts's getKpiOverview makes the identical assumption:
 *     `Math.round(newUsers30d / 0.08)`, an assumed ~8% visitor→account rate).
 *     Every OTHER funnel step (accounts, firstPurchase, firstLesson,
 *     completed, certificate) is fully real.
 *
 *  2. Geo / topCountries — the mock fabricates a city→country lookup
 *     (CITY_COUNTRY) over its synthetic city names to produce a rich
 *     multi-country breakdown. The real `users` table only has a single
 *     freeform `country` text column (nullable; today only ever set to 'HT'
 *     or left null by anything upstream — no signup flow captures a finer
 *     country/city yet). topCountries here groups by that raw value: 'HT' →
 *     'Haïti' (same label the mock uses), unset/null → 'Autre', anything
 *     else passed through verbatim — degrading gracefully to a coarse
 *     Haïti/Autre split until a real geo-capture (IP geolocation, a country
 *     selector at signup, etc.) populates finer values. htUsers/diasporaUsers
 *     stay fully real (raw `country === 'HT'` vs not, same test as
 *     ./users.ts's countryOf).
 *
 *  3. Subscription growth's "canceled" bucketing reuses the same
 *     `canceledAtOf` approximation documented in ./subscriptions.ts
 *     (degeneracy note 2 there): no explicit `canceled_at` column, so a
 *     canceled subscription's cancellation moment is approximated as
 *     `updatedAt` when `status === 'canceled'`.
 *
 *  4. Heatmap / funnel's "firstLesson" (watched) step — `progress` is a
 *     PER-LESSON row model (userId, courseSlug, lessonIndex, completedAt,
 *     lastPositionSeconds, updatedAt), not the mock's per-(user,course)
 *     aggregate. "Activity" on a row = `completedAt` set OR
 *     `lastPositionSeconds > 0` (identical test to ./engagement.ts's
 *     `buildProgressGroups`). The heatmap therefore plots one point per
 *     lesson-activity event instead of one per (user,course) enrollment as
 *     in the mock — busier but strictly more informative; the output shape
 *     (7×24 `HeatCell[]`, Haiti UTC-5) is identical.
 *
 * On a near-empty DB (0 users/payments/etc., the owner's own state at
 * launch) every section below degrades to its correctly-shaped empty/zero
 * form — buckets still render (from the query's own from/to), every array is
 * `[]` or all-zero, every percentage is guarded against divide-by-zero — and
 * this never throws.
 */
import { db, schema } from '@/db';
import { paymentsSelectSafe, PAYMENTS_COLUMNS_PRE_0019 } from '@/db/payments-compat';
import { getCourseMap } from '@/lib/courses/source';
import type {
  AnalyticsData,
  AnalyticsQuery,
  CountBucket,
  CountryRow,
  CourseRevenue,
  EnrollBucket,
  FunnelStep,
  HeatCell,
  Locale,
  MethodRevenue,
  PaymentMethod,
  RevenueBucket,
  SubGrowthBucket,
} from '../types';

const T = schema;
const DAY = 86_400_000;
const ALL_METHODS: PaymentMethod[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];

const methodOf = (p: string): PaymentMethod => (p === 'stripe' ? 'card' : (p as PaymentMethod));
const langOf = (l: string | null): Locale => (l === 'fr' ? 'fr' : 'ht');

const HT_LABEL = 'Haïti';
const UNSET_COUNTRY_LABEL = 'Autre';
/** See file-header degeneracy note (2). */
function countryLabel(raw: string | null): string {
  if (!raw) return UNSET_COUNTRY_LABEL;
  return raw === 'HT' ? HT_LABEL : raw;
}

type DbSub = typeof T.subscriptions.$inferSelect;
type DbProgress = typeof T.progress.$inferSelect;

/** See ./subscriptions.ts degeneracy note (2): no canceled_at column. */
function canceledAtMs(s: DbSub): number {
  return s.status === 'canceled' ? s.updatedAt.getTime() : Infinity;
}

/** See file-header degeneracy note (4). */
function isActivity(p: DbProgress): boolean {
  return Boolean(p.completedAt) || p.lastPositionSeconds > 0;
}

async function loadAll() {
  const [u, p, s, e, pr, cert, courseBySlug] = await Promise.all([
    db.select().from(T.users),
    paymentsSelectSafe(
      () => db.select().from(T.payments),
      () => db.select(PAYMENTS_COLUMNS_PRE_0019).from(T.payments),
    ),
    db.select().from(T.subscriptions),
    db.select().from(T.enrollments),
    db.select().from(T.progress),
    // Only `userId` is needed (the funnel's "has a certificate" test) — a
    // narrow select, not a full row load like the other tables here.
    db.select({ userId: T.certificates.userId }).from(T.certificates),
    getCourseMap(),
  ]);
  return { u, p, s, e, pr, cert, courseBySlug };
}

/* --------------------------- bucket helpers ------------------------------- */
/** Mirrors the mock's `buildBuckets`/`bucketIndex` exactly — same boundaries,
 *  same label formats (day/week: DD/MM, month: MM/YY) — so bucket labels
 *  produced here are byte-identical to the mock for the same query. */
type Bucket = { start: number; end: number; label: string };
function buildBuckets(fromMs: number, toMs: number, gran: AnalyticsQuery['granularity']): Bucket[] {
  const out: Bucket[] = [];
  if (gran === 'month') {
    const d = new Date(fromMs);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() <= toMs) {
      const start = d.getTime();
      const next = new Date(d);
      next.setMonth(d.getMonth() + 1);
      out.push({
        start,
        end: next.getTime() - 1,
        label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`,
      });
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    const step = gran === 'week' ? 7 * DAY : DAY;
    const s = new Date(fromMs);
    s.setHours(0, 0, 0, 0);
    for (let t = s.getTime(); t <= toMs; t += step) {
      const dd = new Date(t);
      out.push({
        start: t,
        end: t + step - 1,
        label: `${String(dd.getDate()).padStart(2, '0')}/${String(dd.getMonth() + 1).padStart(2, '0')}`,
      });
    }
  }
  return out;
}
function bucketIndex(buckets: Bucket[], ms: number): number {
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i].start && ms <= buckets[i].end) return i;
  }
  return -1;
}

/* ============================== analytics ================================= */
export async function getAnalytics(q: AnalyticsQuery): Promise<AnalyticsData> {
  const { u, p, s, e, pr, cert, courseBySlug } = await loadAll();
  const fromMs = Date.parse(q.from);
  const toMs = Date.parse(q.to);
  const inRange = (ms: number) => ms >= fromMs && ms <= toMs;
  const buckets = buildBuckets(fromMs, toMs, q.granularity);
  const userById = new Map(u.map((x) => [x.id, x]));

  // 1. Revenue over time (subscription vs course).
  const revenueSeries: RevenueBucket[] = buckets.map((b) => ({
    bucket: b.label, subscriptionCents: 0, courseCents: 0, totalCents: 0,
  }));
  let subscriptionRevenueCents = 0;
  let courseRevenueCents = 0;
  for (const pay of p) {
    if (pay.status !== 'completed') continue;
    const ms = pay.createdAt.getTime();
    if (!inRange(ms)) continue;
    const i = bucketIndex(buckets, ms);
    if (i < 0) continue;
    if (pay.productType === 'subscription') {
      revenueSeries[i].subscriptionCents += pay.amountCents;
      subscriptionRevenueCents += pay.amountCents;
    } else {
      revenueSeries[i].courseCents += pay.amountCents;
      courseRevenueCents += pay.amountCents;
    }
    revenueSeries[i].totalCents += pay.amountCents;
  }

  // 2. Signups.
  const signupsSeries: CountBucket[] = buckets.map((b) => ({ bucket: b.label, count: 0 }));
  for (const user of u) {
    const ms = user.createdAt.getTime();
    if (!inRange(ms)) continue;
    const i = bucketIndex(buckets, ms);
    if (i >= 0) signupsSeries[i].count++;
  }

  // 3. Enrollments + new subscriptions.
  const enrollmentsSeries: EnrollBucket[] = buckets.map((b) => ({
    bucket: b.label, enrollments: 0, subscriptions: 0,
  }));
  for (const enr of e) {
    const ms = enr.purchasedAt.getTime();
    if (!inRange(ms)) continue;
    const i = bucketIndex(buckets, ms);
    if (i >= 0) enrollmentsSeries[i].enrollments++;
  }
  for (const sub of s) {
    const ms = sub.createdAt.getTime();
    if (!inRange(ms)) continue;
    const i = bucketIndex(buckets, ms);
    if (i >= 0) enrollmentsSeries[i].subscriptions++;
  }

  // 4. Revenue by method.
  const methodMap = new Map<PaymentMethod, number>();
  for (const pay of p) {
    if (pay.status !== 'completed') continue;
    const ms = pay.createdAt.getTime();
    if (!inRange(ms)) continue;
    const m = methodOf(pay.provider);
    methodMap.set(m, (methodMap.get(m) ?? 0) + pay.amountCents);
  }
  const methodTotal = [...methodMap.values()].reduce((a, b) => a + b, 0);
  const revenueByMethod: MethodRevenue[] = ALL_METHODS.map((m) => {
    const cents = methodMap.get(m) ?? 0;
    return { method: m, cents, pct: methodTotal ? (cents / methodTotal) * 100 : 0 };
  })
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  // 5. Revenue by course.
  const revByCourse = new Map<string, { rev: number; enr: number }>();
  for (const pay of p) {
    if (pay.status !== 'completed' || pay.productType !== 'course' || !pay.courseSlug) continue;
    const ms = pay.createdAt.getTime();
    if (!inRange(ms)) continue;
    const acc = revByCourse.get(pay.courseSlug) ?? { rev: 0, enr: 0 };
    acc.rev += pay.amountCents;
    acc.enr++;
    revByCourse.set(pay.courseSlug, acc);
  }
  const revenueByCourse: CourseRevenue[] = [...courseBySlug.values()]
    .map((c) => {
      const acc = revByCourse.get(c.slug) ?? { rev: 0, enr: 0 };
      return {
        code: c.code, slug: c.slug, title_fr: c.title_fr, title_ht: c.title_ht,
        revenueCents: acc.rev, enrollments: acc.enr,
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);

  // 6. Subscription growth. See file-header degeneracy note (3).
  const subscriptionGrowth: SubGrowthBucket[] = buckets.map((b) => {
    let created = 0;
    let canceled = 0;
    let activeCumulative = 0;
    for (const sub of s) {
      const st = sub.createdAt.getTime();
      const ca = canceledAtMs(sub);
      if (st >= b.start && st <= b.end) created++;
      if (ca >= b.start && ca <= b.end) canceled++;
      if (st <= b.end && ca > b.end) activeCumulative++;
    }
    return { bucket: b.label, created, canceled, activeCumulative };
  });

  // 7. Geo (users + revenue in range, by country). See degeneracy note (2).
  const usersInRange = u.filter((x) => inRange(x.createdAt.getTime()));
  const countryMap = new Map<string, { users: number; rev: number }>();
  for (const user of usersInRange) {
    const c = countryLabel(user.country);
    const acc = countryMap.get(c) ?? { users: 0, rev: 0 };
    acc.users++;
    countryMap.set(c, acc);
  }
  for (const pay of p) {
    if (pay.status !== 'completed') continue;
    const ms = pay.createdAt.getTime();
    if (!inRange(ms)) continue;
    const user = userById.get(pay.userId);
    if (!user) continue;
    const c = countryLabel(user.country);
    const acc = countryMap.get(c) ?? { users: 0, rev: 0 };
    acc.rev += pay.amountCents;
    countryMap.set(c, acc);
  }
  const topCountries: CountryRow[] = [...countryMap.entries()]
    .map(([country, acc]) => ({ country, users: acc.users, revenueCents: acc.rev }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 10);

  // 8. Language split.
  const language = { ht: { users: 0, revenueCents: 0 }, fr: { users: 0, revenueCents: 0 } };
  for (const user of usersInRange) language[langOf(user.localePref)].users++;
  for (const pay of p) {
    if (pay.status !== 'completed') continue;
    const ms = pay.createdAt.getTime();
    if (!inRange(ms)) continue;
    const user = userById.get(pay.userId);
    if (user) language[langOf(user.localePref)].revenueCents += pay.amountCents;
  }

  // 9. Conversion funnel (cohort = users created in range).
  // Step "visitors" is MOCK — see file-header degeneracy note (1). Every
  // other step is a strict subset of the previous → a true monotonic funnel.
  const cohortIds = new Set(usersInRange.map((x) => x.id));
  const paidIds = new Set(
    p.filter((pay) => pay.status === 'completed' && cohortIds.has(pay.userId)).map((pay) => pay.userId),
  );
  // "Watched" — see degeneracy note (4).
  const activityUserIds = new Set(pr.filter(isActivity).map((row) => row.userId));
  const watched = new Set(usersInRange.filter((x) => activityUserIds.has(x.id)).map((x) => x.id));
  const lessonIds = new Set([...paidIds].filter((id) => watched.has(id)));

  const doneMap = new Map<string, Map<string, number>>();
  for (const row of pr) {
    if (!row.completedAt) continue;
    let byCourse = doneMap.get(row.userId);
    if (!byCourse) {
      byCourse = new Map();
      doneMap.set(row.userId, byCourse);
    }
    byCourse.set(row.courseSlug, (byCourse.get(row.courseSlug) ?? 0) + 1);
  }
  const completedRaw = new Set<string>();
  for (const [userId, byCourse] of doneMap) {
    for (const [slug, done] of byCourse) {
      const total = courseBySlug.get(slug)?.lessons.length ?? Infinity;
      if (done >= total) {
        completedRaw.add(userId);
        break;
      }
    }
  }
  const completedIds = new Set([...lessonIds].filter((id) => completedRaw.has(id)));
  const certRaw = new Set(cert.map((c) => c.userId));
  const certIds = new Set([...completedIds].filter((id) => certRaw.has(id)));

  const accounts = usersInRange.length;
  // visitors is MOCK — needs a real traffic-analytics tool (no visit events in the DB).
  const visitors = Math.round(accounts / 0.08);
  const funnel: FunnelStep[] = [
    { step: 'visitors', count: visitors },
    { step: 'accounts', count: accounts },
    { step: 'firstPurchase', count: paidIds.size },
    { step: 'firstLesson', count: lessonIds.size },
    { step: 'completed', count: completedIds.size },
    { step: 'certificate', count: certIds.size },
  ];

  // 10. Watch heatmap (lesson activity in range, weekday × hour, Haiti UTC-5).
  // See file-header degeneracy note (4).
  const heat = new Map<string, number>();
  for (const row of pr) {
    if (!isActivity(row)) continue;
    const ms = row.updatedAt.getTime();
    if (!inRange(ms)) continue;
    const local = new Date(ms - 5 * 3600 * 1000); // UTC-5
    const key = `${local.getUTCDay()}-${local.getUTCHours()}`;
    heat.set(key, (heat.get(key) ?? 0) + 1);
  }
  const heatmap: HeatCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({ day, hour, count: heat.get(`${day}-${hour}`) ?? 0 });
    }
  }

  return {
    granularity: q.granularity,
    revenueSeries,
    revenueTotalCents: subscriptionRevenueCents + courseRevenueCents,
    subscriptionRevenueCents,
    courseRevenueCents,
    signupsSeries,
    enrollmentsSeries,
    revenueByMethod,
    revenueByCourse,
    subscriptionGrowth,
    geo: {
      htUsers: usersInRange.filter((x) => x.country === 'HT').length,
      diasporaUsers: usersInRange.filter((x) => x.country !== 'HT').length,
      topCountries,
    },
    language,
    funnel,
    heatmap,
  };
}
