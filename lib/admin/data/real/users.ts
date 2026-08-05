/**
 * Real (Drizzle) implementation of the USER cluster of AdminDataSource — the
 * first domain migrated off mock (Phase D Lot 3). Reads/writes the Neon DB via
 * `db`. The mock (`lib/admin/data/mock/index.ts`) is the reference for every
 * method's exact return shape; this file reproduces that shape from real rows.
 *
 * Vocabulary mapping DB → admin UI:
 *  - payments.status 'completed'  → 'succeeded'
 *  - subscriptions.status 'incomplete' → 'past_due'
 *  - users.country 'HT' → 'HT', anything else → 'diaspora'
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCourseMap } from '@/lib/courses/source';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import type {
  AdminActor,
  ActivityEvent,
  Country,
  CourseAccess,
  CourseBucket,
  KpiOverview,
  Locale,
  PaymentMethod,
  PaymentStatus,
  SubscriptionStatus,
  UserDetail,
  UserRow,
  UsersPage,
  UsersQuery,
  UserStatus,
  UserType,
} from '../types';

const T = schema;
const DAY = 86_400_000;
const PAGE_SIZE = 25;
const SUB_CENTS = SUBSCRIPTION_USD * 100;

/* ----------------------------- mappers ----------------------------------- */
const payStatus = (s: string): PaymentStatus => (s === 'completed' ? 'succeeded' : (s as PaymentStatus));
const methodOf = (p: string): PaymentMethod => (p === 'stripe' ? 'card' : (p as PaymentMethod));
const subStatus = (s: string): SubscriptionStatus => (s === 'incomplete' ? 'past_due' : (s as SubscriptionStatus));
const countryOf = (c: string | null): Country => (c === 'HT' ? 'HT' : 'diaspora');
const langOf = (l: string | null): Locale => (l === 'fr' ? 'fr' : 'ht');

/** Row shapes we pull once and reuse for list + KPI aggregation. */
type DbUser = typeof T.users.$inferSelect;
type DbPayment = typeof T.payments.$inferSelect;
type DbSub = typeof T.subscriptions.$inferSelect;
type DbEnroll = typeof T.enrollments.$inferSelect;
type DbProgress = typeof T.progress.$inferSelect;

async function loadAll() {
  const [u, p, s, e, pr, cl, courseBySlug] = await Promise.all([
    db.select().from(T.users),
    db.select().from(T.payments),
    db.select().from(T.subscriptions),
    db.select().from(T.enrollments),
    db.select().from(T.progress),
    db.select().from(T.creditLedger),
    getCourseMap(),
  ]);
  return { u, p, s, e, pr, cl, courseBySlug };
}

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

function enrichUser(
  user: DbUser,
  pays: DbPayment[],
  subs: DbSub[],
  enrolls: DbEnroll[],
  prog: DbProgress[],
  /** Total course count (DB-first, static-fallback — see `getCourseMap`),
   *  what an all-access subscriber has access to. Stage 7 fix: this used to
   *  be the STATIC catalog's fixed length, so a subscriber's "courses
   *  access" count silently ignored every DB-authored course beyond the 9
   *  static ones. */
  totalCourseCount: number,
): UserRow {
  const myPays = pays.filter((p) => p.userId === user.id);
  const succeeded = myPays.filter((p) => p.status === 'completed');
  const totalSpentCents = succeeded.reduce((a, p) => a + p.amountCents, 0);
  const sub = subs.find((s) => s.userId === user.id);
  const subscriptionStatus = sub ? subStatus(sub.status) : null;
  const isSubscriber = subscriptionStatus === 'active';

  const coursesPurchased = new Set(
    succeeded.filter((p) => p.productType === 'course' && p.courseSlug).map((p) => p.courseSlug),
  ).size;
  const myEnrolls = enrolls.filter((e) => e.userId === user.id);
  const coursesAccess = isSubscriber ? totalCourseCount : new Set(myEnrolls.map((e) => e.courseSlug)).size;

  const type: UserType = subscriptionStatus === 'active' ? 'active_subscriber' : succeeded.length > 0 ? 'one_off' : 'free';

  const myProg = prog.filter((p) => p.userId === user.id && (p.lastPositionSeconds > 0 || p.completedAt));
  const lastActiveAt =
    myProg.length > 0
      ? myProg.reduce<string | null>((m, p) => {
          const t = iso(p.updatedAt);
          return t && (!m || t > m) ? t : m;
        }, null)
      : null;
  const lastPaymentAt =
    myPays.length > 0 ? myPays.reduce<string>((m, p) => { const t = iso(p.createdAt)!; return t > m ? t : m; }, iso(myPays[0].createdAt)!) : null;

  return {
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    phone: user.phone ?? '',
    country: countryOf(user.country),
    city: user.city ?? '',
    language: langOf(user.localePref),
    createdAt: iso(user.createdAt)!,
    type,
    status: user.status as UserStatus,
    subscriptionStatus,
    coursesPurchased,
    coursesAccess,
    totalSpentCents,
    lastActiveAt,
    lastPaymentAt,
  };
}

function courseBucket(n: number): CourseBucket {
  if (n <= 0) return '0';
  if (n >= 5) return '5plus';
  return String(n) as CourseBucket;
}

function matchesBase(r: UserRow, q: UsersQuery): boolean {
  if (q.search) {
    const s = q.search.trim().toLowerCase();
    const phone = r.phone.replace(/\s/g, '').toLowerCase();
    if (!r.name.toLowerCase().includes(s) && !r.email.toLowerCase().includes(s) && !phone.includes(s.replace(/\s/g, ''))) return false;
  }
  if (q.country && r.country !== q.country) return false;
  if (q.language && r.language !== q.language) return false;
  if (q.from && r.createdAt < q.from) return false;
  if (q.to && r.createdAt > q.to + 'T23:59:59.999Z') return false;
  return true;
}

function sortRows(rows: UserRow[], q: UsersQuery): UserRow[] {
  const dir = q.dir === 'asc' ? 1 : -1;
  const key = q.sort ?? 'createdAt';
  return [...rows].sort((a, b) => {
    if (key === 'totalSpent') return (a.totalSpentCents - b.totalSpentCents) * dir;
    if (key === 'lastActive') {
      const av = a.lastActiveAt ? Date.parse(a.lastActiveAt) : -Infinity;
      const bv = b.lastActiveAt ? Date.parse(b.lastActiveAt) : -Infinity;
      return (av - bv) * dir;
    }
    return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir;
  });
}

async function selectUsers(q: UsersQuery) {
  const { u, p, s, e, pr, courseBySlug } = await loadAll();
  const now = Date.now();
  const all = u.map((user) => enrichUser(user, p, s, e, pr, courseBySlug.size));
  const base = all.filter((r) => matchesBase(r, q));
  let filtered = base.filter((r) => {
    if (q.type && r.type !== q.type) return false;
    if (q.courses && courseBucket(r.coursesAccess) !== q.courses) return false;
    if (q.segment === 'inactive') {
      const old = Date.parse(r.createdAt) < now - 14 * DAY;
      if (!(old && r.lastActiveAt === null && r.totalSpentCents === 0)) return false;
    }
    return true;
  });
  if (q.segment === 'top_spenders') filtered = sortRows(filtered, { sort: 'totalSpent', dir: 'desc' }).slice(0, 20);
  else filtered = sortRows(filtered, q);
  return { base, filtered };
}

/* ------------------------------- reads ----------------------------------- */
export async function getUsers(query: UsersQuery): Promise<UsersPage> {
  const { base, filtered } = await selectUsers(query);
  const byType: Record<UserType, number> = { active_subscriber: 0, one_off: 0, free: 0 };
  const byCourses: Record<CourseBucket, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5plus': 0 };
  for (const r of base) {
    byType[r.type]++;
    byCourses[courseBucket(r.coursesAccess)]++;
  }
  const page = Math.max(1, query.page ?? 1);
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const start = (page - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    segmentCounts: { all: base.length, byType, byCourses },
  };
}

export async function exportUsers(query: UsersQuery): Promise<UserRow[]> {
  return (await selectUsers(query)).filtered;
}

export async function getUserById(id: string): Promise<UserDetail | null> {
  const [user] = await db.select().from(T.users).where(eq(T.users.id, id)).limit(1);
  if (!user) return null;
  const { p, s, e, pr, courseBySlug } = await loadAll();
  const row = enrichUser(user, p, s, e, pr, courseBySlug.size);

  const myPays = p
    .filter((x) => x.userId === id)
    .map((x) => ({
      id: x.id,
      userId: x.userId,
      productType: x.productType,
      courseSlug: x.courseSlug,
      method: methodOf(x.provider),
      status: payStatus(x.status),
      amountCents: x.amountCents,
      currency: 'USD' as const,
      createdAt: iso(x.createdAt)!,
      isRefund: x.status === 'refunded' ? true : undefined,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const sub = s.find((x) => x.userId === id);
  const progressFor = (slug: string) => pr.find((x) => x.userId === id && x.courseSlug === slug);
  const myCourses: CourseAccess[] = e
    .filter((x) => x.userId === id)
    .map((x): CourseAccess => {
      const c = courseBySlug.get(x.courseSlug);
      const done = pr.filter((q) => q.userId === id && q.courseSlug === x.courseSlug && q.completedAt).length;
      const status: 'active' | 'expired' = sub && subStatus(sub.status) !== 'active' && x.status === 'active' ? 'active' : 'active';
      return {
        slug: x.courseSlug,
        code: c?.code ?? x.courseSlug,
        title_fr: c?.title_fr ?? x.courseSlug,
        title_ht: c?.title_ht ?? x.courseSlug,
        source: x.relatedPaymentId ? 'purchase' : 'granted',
        status,
        enrolledAt: iso(x.purchasedAt)!,
        lessonsDone: done,
        lessonsTotal: c?.lessons.length ?? 0,
      };
    })
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));

  const certs = (await db.select().from(T.certificates).where(eq(T.certificates.userId, id)))
    .map((c) => ({ id: c.id, userId: c.userId, courseSlug: c.courseSlug, issuedAt: iso(c.issuedAt)!, verificationCode: c.verificationCode, revoked: c.revoked }))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  const credits = (await db.select().from(T.creditLedger).where(eq(T.creditLedger.userId, id)))
    .map((c) => ({ id: c.id, userId: c.userId, amountCents: c.amountCents, reason: c.reason, createdAt: iso(c.createdAt)! }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const creditBalanceCents = credits.reduce((a, c) => a + c.amountCents, 0);

  const [acq] = await db.select().from(T.userAcquisition).where(eq(T.userAcquisition.userId, id)).limit(1);
  const acquisition = acq
    ? { userId: id, utmSource: acq.utmSource ?? '', utmMedium: acq.utmMedium ?? '', utmCampaign: acq.utmCampaign ?? '', capturedAt: iso(acq.capturedAt)! }
    : null;

  const auditRows = (await db.select().from(T.auditLog).where(eq(T.auditLog.targetUserId, id)).orderBy(desc(T.auditLog.createdAt)))
    .map((a) => ({ id: a.id, adminId: a.adminId, adminName: a.adminName, action: a.action as never, targetUserId: a.targetUserId ?? '', detail: a.detail ?? undefined, reason: a.reason ?? undefined, createdAt: iso(a.createdAt)! }));

  // Activity feed synthesised from the records (same shape as mock).
  const activity: ActivityEvent[] = [];
  let aSeq = 0;
  const ev = (type: ActivityEvent['type'], at: string, fr: string, ht: string) =>
    activity.push({ id: `act_${id}_${++aSeq}`, type, at, label_fr: fr, label_ht: ht });
  ev('account_created', row.createdAt, 'Création du compte', 'Kreyasyon kont lan');
  for (const pay of myPays) {
    if (pay.status === 'succeeded' && pay.productType === 'course') {
      const c = courseBySlug.get(pay.courseSlug ?? '');
      ev('purchase', pay.createdAt, `Achat — ${c?.title_fr ?? pay.courseSlug}`, `Acha — ${c?.title_ht ?? pay.courseSlug}`);
    } else if (pay.status === 'refunded') ev('refund', pay.createdAt, 'Remboursement', 'Ranbousman');
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return {
    user: { ...row, certificateName: user.certificateName ?? row.name },
    payments: myPays,
    courses: myCourses,
    certificates: certs,
    credits,
    creditBalanceCents,
    activity: activity.slice(0, 60),
    audit: auditRows,
    acquisition,
  };
}

function sameDay(t: number, now: number) { const d = new Date(t), n = new Date(now); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); }
function withinDays(t: number, days: number, now: number) { return t <= now && t >= now - days * DAY; }
function sameMonth(t: number, now: number) { const d = new Date(t), n = new Date(now); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); }

export async function getKpiOverview(): Promise<KpiOverview> {
  const { u, p, s, e } = await loadAll();
  const now = Date.now();
  const succeeded = p.filter((x) => x.status === 'completed');
  const refunded = p.filter((x) => x.status === 'refunded');
  const activeSubs = s.filter((x) => x.status === 'active').length;
  const canceledSubs = s.filter((x) => x.status === 'canceled').length;
  const totalRevenueCents = succeeded.reduce((a, x) => a + x.amountCents, 0);
  const payingUsers = new Set(succeeded.map((x) => x.userId)).size;
  const ts = (d: Date | string) => (typeof d === 'string' ? Date.parse(d) : d.getTime());
  const newUsers30d = u.filter((x) => withinDays(ts(x.createdAt), 30, now)).length;
  const visitorsThisMonth = Math.round(newUsers30d / 0.08);
  const churnDenom = activeSubs + canceledSubs;
  const churnRatePct = churnDenom ? (canceledSubs / churnDenom) * 100 : 0;
  const arpuCents = u.length ? Math.round(totalRevenueCents / u.length) : 0;
  const revPerPaying = payingUsers ? totalRevenueCents / payingUsers : 0;
  const churnFraction = Math.min(Math.max(churnRatePct / 100, 0.05), 0.95);

  return {
    currency: 'USD',
    totalUsers: u.length,
    activeSubscribers: activeSubs,
    mrrCents: activeSubs * SUB_CENTS,
    totalRevenueCents,
    revenueThisMonthCents: succeeded.filter((x) => sameMonth(ts(x.createdAt), now)).reduce((a, x) => a + x.amountCents, 0),
    newUsersToday: u.filter((x) => sameDay(ts(x.createdAt), now)).length,
    newUsers7d: u.filter((x) => withinDays(ts(x.createdAt), 7, now)).length,
    newUsers30d,
    newEnrollmentsToday: e.filter((x) => sameDay(ts(x.purchasedAt), now)).length,
    newEnrollments7d: e.filter((x) => withinDays(ts(x.purchasedAt), 7, now)).length,
    newEnrollments30d: e.filter((x) => withinDays(ts(x.purchasedAt), 30, now)).length,
    visitorsThisMonth,
    conversionVisitorToAccountPct: visitorsThisMonth ? (newUsers30d / visitorsThisMonth) * 100 : 0,
    conversionAccountToPayingPct: u.length ? (payingUsers / u.length) * 100 : 0,
    activeLearners7d: 0,
    activeLearners30d: 0,
    churnRatePct,
    arpuCents,
    ltvCents: Math.round(revPerPaying / churnFraction),
    refundsCount: refunded.length,
    refundsAmountCents: refunded.reduce((a, x) => a + x.amountCents, 0),
  };
}

/* ------------------------------ mutations -------------------------------- */
export async function recordAudit(p: { action: string; userId: string; admin: AdminActor; detail?: string; reason?: string }): Promise<void> {
  await db.insert(T.auditLog).values({
    adminId: p.admin.id,
    adminName: p.admin.name,
    action: p.action,
    targetUserId: p.userId,
    detail: p.detail ?? null,
    reason: p.reason ?? null,
  });
}

export async function setUserStatus(p: { userId: string; status: UserStatus; reason: string; admin: AdminActor }): Promise<void> {
  await db.update(T.users).set({ status: p.status }).where(eq(T.users.id, p.userId));
  const action = p.status === 'banned' ? 'ban_user' : p.status === 'suspended' ? 'suspend_user' : 'reactivate_user';
  await recordAudit({ action, userId: p.userId, admin: p.admin, reason: p.reason });
}

export async function addManualCredit(p: { userId: string; amountCents: number; note: string; admin: AdminActor }): Promise<void> {
  await db.insert(T.creditLedger).values({ userId: p.userId, amountCents: Math.round(p.amountCents), reason: 'manual' });
  await recordAudit({ action: 'add_credit', userId: p.userId, admin: p.admin, detail: String(p.amountCents), reason: p.note || undefined });
}

export async function grantCourseAccess(p: { userId: string; courseSlug: string; admin: AdminActor }): Promise<void> {
  const existing = await db.select().from(T.enrollments).where(and(eq(T.enrollments.userId, p.userId), eq(T.enrollments.courseSlug, p.courseSlug))).limit(1);
  if (existing.length === 0) await db.insert(T.enrollments).values({ userId: p.userId, courseSlug: p.courseSlug, status: 'active' });
  await recordAudit({ action: 'grant_course', userId: p.userId, admin: p.admin, detail: p.courseSlug });
}

export async function revokeCourseAccess(p: { userId: string; courseSlug: string; admin: AdminActor }): Promise<void> {
  await db.delete(T.enrollments).where(and(eq(T.enrollments.userId, p.userId), eq(T.enrollments.courseSlug, p.courseSlug)));
  await recordAudit({ action: 'revoke_course', userId: p.userId, admin: p.admin, detail: p.courseSlug });
}

export async function grantSubscription(p: { userId: string; admin: AdminActor }): Promise<void> {
  const [existing] = await db.select().from(T.subscriptions).where(eq(T.subscriptions.userId, p.userId)).limit(1);
  const periodEnd = new Date(Date.now() + 30 * DAY);
  if (existing) {
    await db.update(T.subscriptions).set({ status: 'active', currentPeriodEnd: periodEnd, updatedAt: new Date() }).where(eq(T.subscriptions.id, existing.id));
  } else {
    await db.insert(T.subscriptions).values({ userId: p.userId, status: 'active', provider: 'stripe', currentPeriodEnd: periodEnd });
  }
  await recordAudit({ action: 'grant_subscription', userId: p.userId, admin: p.admin });
}

export async function refundPayment(p: { userId: string; paymentId: string; admin: AdminActor }): Promise<void> {
  const [pay] = await db.select().from(T.payments).where(eq(T.payments.id, p.paymentId)).limit(1);
  if (pay && pay.status === 'completed') {
    await db.update(T.payments).set({ status: 'refunded' }).where(eq(T.payments.id, p.paymentId));
    await db.insert(T.creditLedger).values({ userId: p.userId, amountCents: pay.amountCents, reason: 'refund', relatedId: p.paymentId });
  }
  await recordAudit({ action: 'refund_payment', userId: p.userId, admin: p.admin, detail: p.paymentId });
}
